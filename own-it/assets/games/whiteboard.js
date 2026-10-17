/* own-it game template: Whiteboard Map (design spec 6.3, frontend spec 6.3 and 12a.5). The parts of one zone sit on a board in a layered
   layout (sources left, sinks right; on narrow screens sources top, sinks bottom). The player taps a card, then another card, to draw
   an arrow from the first to the second. An arrow is removed with Delete or with its Remove button. "Check my map" grades the arrows with
   OwnItCore.gradeComponent and reveals the board: green = right, dashed red ghost = a missing arrow, crossed out = an arrow that does
   not exist. Keys: arrows move between cards, Enter picks a card, Delete removes the selected arrow. DOM via OwnIt.el and createElementNS only.
   The expected arrows arrive obfuscated and are decoded only when the player checks (or asks for a hint), never to lay the board out. */
(function () {
  'use strict';
  var OwnIt = window.OwnIt;
  var kit = OwnIt.kit;
  var NS = 'http://www.w3.org/2000/svg';
  var XP_EDGE = 10, XP_WRONG = 5;
  var PAD = 16, CARD_H = 52, GAP_FLOW = 64, GAP_ROW = 14, MIN_W = 88, MAX_W = 170, NARROW = 560;

  var own = kit.has, plural = kit.plural;
  function svg(tag, attrs) {
    var n = document.createElementNS ? document.createElementNS(NS, tag) : document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    return n;
  }

  /* Pure. cards: [{id, label, kind}]. Returns { id: { layer, row } }. Uses nothing from the answer, so the layout cannot give it away.
     Layer 0 (left, or top on phones) holds the parts people meet: surfaces, actors, roles, elements. Layer 1 holds everything else
     (components, services, stores). Rows follow the label order, ties by id. Deterministic. */
  var FRONT = { surface: 1, screen: 1, actor: 1, role: 1, element: 1 };
  function layout(cards) {
    var res = {};
    [0, 1].forEach(function (layer) {
      cards.filter(function (c) { return (own(FRONT, c.kind) ? 0 : 1) === layer; })
        .sort(function (x, y) { return String(x.label).localeCompare(String(y.label)) || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0); })
        .forEach(function (c, row) { res[c.id] = { layer: layer, row: row }; });
    });
    return res;
  }
  OwnIt.whiteboardLayout = layout;

  // The point where the line from the centre of rect r towards (tx, ty) leaves r.
  function leave(r, tx, ty) {
    var cx = r.x + r.w / 2, cy = r.y + r.h / 2, dx = tx - cx, dy = ty - cy;
    if (!dx && !dy) return { x: cx, y: cy };
    var s = Math.min(dx ? (r.w / 2 + 3) / Math.abs(dx) : Infinity, dy ? (r.h / 2 + 3) / Math.abs(dy) : Infinity);
    return { x: cx + dx * s, y: cy + dy * s };
  }

  function play(root, round, ctx) {
    var cards = ((round && round.cards) || []).filter(function (c) { return c && typeof c.id === 'string'; });
    var labels = round && round.labels;
    var exam = (round && round.mode === 'exam') || OwnIt.mode === 'exam';
    var mode = exam ? 'exam' : 'practice';
    var answer = null;     // decoded on first need
    function getAnswer() {
      if (answer) return answer;
      try {
        var dec = OwnItCore.decode(round && round.answer);
        if (dec && Array.isArray(dec.edges)) answer = dec;
      } catch (e) { /* reported at Check */ }
      return answer;
    }
    var ids = cards.map(function (c) { return c.id; });
    var byId = {};
    cards.forEach(function (c) { byId[c.id] = c; });
    var L = function (id) { return own(byId, id) && !own(labels, id) && byId[id].label ? byId[id].label : kit.label(id, labels); };
    var items = cards.map(function (c) {
      var kind = c.kind || (own(labels, c.id) && labels[c.id] && labels[c.id].kind) || '';
      return { id: c.id, label: L(c.id), kind: kind };
    });

    var drawn = [];        // [[from, to]]
    var pick = null;       // card id waiting for its target
    var sel = -1;          // index into drawn of the selected arrow
    var checked = false;
    var done = false;
    var result = null;     // gradeComponent output
    var edgesOf = [];      // expected arrows, set at Check
    var pos = {};          // id -> {x, y, w, h}
    var lay = layout(items);

    var shell = OwnIt.shell(root, ctx, {
      zone: round && round.zone, total: 0, side: true,
      hint: exam ? null : function () {
        var ans = getAnswer();
        if (!ans) return 'This board has no hint. Ask Claude to rebuild it.';
        for (var i = 0; i < ans.edges.length; i++) {
          var e = ans.edges[i];
          if (!hasEdge(e.from, e.to)) return L(e.from) + ' sends something onward. Find where it goes.';
        }
        return 'Every arrow is drawn. Press Check my map.';
      }
    });
    shell.setScore(0, '?');
    var area = shell.area, side = shell.side;
    shell.startTimer();

    // ---- play area
    var intro = OwnIt.el('p', { 'class': 'wb-intro' }, 'Tap a part, then the part it sends something to. That draws an arrow. Select an arrow and press Delete to remove it.');
    var live = OwnIt.el('p', { 'class': 'wb-live', 'aria-live': 'polite' });
    var board = OwnIt.el('div', { 'class': 'wb-board', role: 'group', 'aria-label': 'Map board' });
    var layer = svg('svg', { 'class': 'wb-svg', 'aria-hidden': 'true', focusable: 'false' });
    var defs = svg('defs');
    [['gold', 'wb-head-gold'], ['good', 'wb-head-good'], ['bad', 'wb-head-bad']].forEach(function (m) {
      var mk = svg('marker', { id: m[1], 'class': 'wb-head ' + m[1], viewBox: '0 0 10 10', refX: '8', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' });
      mk.appendChild(svg('path', { d: 'M0 0L10 5L0 10z' }));
      defs.appendChild(mk);
    });
    layer.appendChild(defs);
    var arrowsG = svg('g');
    layer.appendChild(arrowsG);
    board.appendChild(layer);
    var cardEls = {};
    cards.forEach(function (c) {
      var b = OwnIt.el('button', { type: 'button', 'class': 'wb-card', 'data-id': c.id }, L(c.id));
      b.addEventListener('click', function () { tapCard(c.id); });
      cardEls[c.id] = b;
      board.appendChild(b);
    });
    var actions = OwnIt.el('div', { 'class': 'actions wb-actions' });
    var checkBtn = OwnIt.button('Check my map', 'primary', function () { check(); }, { 'class': 'btn btn-primary wb-check' });
    var resultBtn = OwnIt.button('See result', 'primary', function () { finish(); }, { 'class': 'btn btn-primary wb-result' });
    resultBtn.setAttribute('hidden', 'hidden');
    actions.appendChild(checkBtn);
    actions.appendChild(resultBtn);
    [intro, live, board, actions].forEach(function (n) { area.appendChild(n); });

    // ---- side panel: arrow list and legend
    var listHead = OwnIt.el('h2', { 'class': 'panel-title' }, 'Your arrows');
    var listEl = OwnIt.el('ul', { 'class': 'wb-list' });
    var legend = OwnIt.el('div', { 'class': 'wb-legend well' });
    side.appendChild(listHead);
    side.appendChild(listEl);
    side.appendChild(legend);

    function say(text) { live.textContent = text; }
    function hasEdge(a, b) { return drawn.some(function (e) { return e[0] === a && e[1] === b; }); }

    // ---- geometry
    function relayout() {
      var rect = board.getBoundingClientRect ? board.getBoundingClientRect() : null;
      var W = Math.max(240, Math.round((rect && rect.width) || 640));
      // only the layers that hold cards take space
      var used = [0, 1].filter(function (l) { return ids.some(function (id) { return lay[id].layer === l; }); });
      var groups = used.map(function (l) {
        return ids.filter(function (id) { return lay[id].layer === l; }).sort(function (x, y) { return lay[x].row - lay[y].row; });
      });
      var layers = groups.length, rows = 0;
      groups.forEach(function (g) { rows = Math.max(rows, g.length); });
      var cw = Math.floor((W - 2 * PAD - (layers - 1) * GAP_FLOW) / Math.max(layers, 1));
      var horizontal = W >= NARROW && cw >= MIN_W;
      var H;
      if (horizontal) {
        cw = Math.min(MAX_W, cw);
        var span = layers * cw + (layers - 1) * GAP_FLOW, x0 = Math.max(PAD, Math.round((W - span) / 2));
        H = 2 * PAD + rows * CARD_H + Math.max(rows - 1, 0) * GAP_ROW;
        groups.forEach(function (g, gi) {
          var colH = g.length * CARD_H + (g.length - 1) * GAP_ROW;
          g.forEach(function (id, r) {
            pos[id] = { x: x0 + gi * (cw + GAP_FLOW), y: Math.round((H - colH) / 2) + r * (CARD_H + GAP_ROW), w: cw, h: CARD_H };
          });
        });
      } else {
        // phones: each layer is a band; a band wraps onto more rows so every card keeps at least MIN_W
        var perRow = Math.max(1, Math.floor((W - 2 * PAD + GAP_ROW) / (MIN_W + GAP_ROW)));
        var vw = Math.min(MAX_W, Math.floor((W - 2 * PAD - (perRow - 1) * GAP_ROW) / perRow));
        var y = PAD;
        groups.forEach(function (g, gi) {
          g.forEach(function (id, j) {
            var r = Math.floor(j / perRow), inRow = Math.min(perRow, g.length - r * perRow), c = j % perRow;
            var rowW = inRow * vw + (inRow - 1) * GAP_ROW;
            pos[id] = { x: Math.round((W - rowW) / 2) + c * (vw + GAP_ROW), y: y + r * (CARD_H + GAP_ROW), w: vw, h: CARD_H };
          });
          var bandRows = Math.ceil(g.length / perRow);
          y += bandRows * CARD_H + (bandRows - 1) * GAP_ROW + (gi < groups.length - 1 ? GAP_FLOW / 2 : 0);
        });
        H = y + PAD;
      }
      board.style.height = H + 'px';
      layer.setAttribute('width', String(W));
      layer.setAttribute('height', String(H));
      layer.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      ids.forEach(function (id) {
        var s = cardEls[id].style, p = pos[id];
        s.left = p.x + 'px'; s.top = p.y + 'px'; s.width = p.w + 'px'; s.height = p.h + 'px';
      });
      paintArrows();
    }

    // ---- arrows
    function line(from, to, reverse) {
      var a = pos[from], b = pos[to];
      if (!a || !b) return null;
      var acx = a.x + a.w / 2, acy = a.y + a.h / 2, bcx = b.x + b.w / 2, bcy = b.y + b.h / 2;
      var p = leave(a, bcx, bcy), q = leave(b, acx, acy);
      if (reverse) { // a reverse arrow exists: shift sideways so both stay visible
        var dx = q.x - p.x, dy = q.y - p.y, len = Math.sqrt(dx * dx + dy * dy) || 1, ox = -dy / len * 7, oy = dx / len * 7;
        p = { x: p.x + ox, y: p.y + oy }; q = { x: q.x + ox, y: q.y + oy };
      }
      return { p: p, q: q };
    }

    function edgeNode(from, to, kind, index, reverse) {
      var ln = line(from, to, reverse);
      if (!ln) return null;
      var g = svg('g', { 'class': 'wb-edge' + (kind ? ' ' + kind : '') + (kind === '' && index === sel ? ' sel' : '') });
      var d = 'M' + ln.p.x.toFixed(1) + ' ' + ln.p.y.toFixed(1) + 'L' + ln.q.x.toFixed(1) + ' ' + ln.q.y.toFixed(1);
      var head = kind === 'good' ? 'good' : kind === 'wrong' || kind === 'ghost' ? 'bad' : 'gold';
      g.appendChild(svg('path', { d: d, 'class': 'wb-hit' }));
      var vis = svg('path', { d: d, 'class': 'wb-line', 'marker-end': 'url(#wb-head-' + head + ')' });
      g.appendChild(vis);
      var name = L(from) + ' to ' + L(to);
      if (kind === 'ghost') {
        g.setAttribute('aria-label', 'Missing arrow, ' + name);
      } else {
        if (kind === 'wrong') {
          var mx = (ln.p.x + ln.q.x) / 2, my = (ln.p.y + ln.q.y) / 2, c = svg('g', { 'class': 'wb-cross' });
          c.appendChild(svg('path', { d: 'M' + (mx - 7) + ' ' + (my - 7) + 'L' + (mx + 7) + ' ' + (my + 7) }));
          c.appendChild(svg('path', { d: 'M' + (mx - 7) + ' ' + (my + 7) + 'L' + (mx + 7) + ' ' + (my - 7) }));
          g.appendChild(c);
        }
        if (kind) {
          g.setAttribute('aria-label', (kind === 'good' ? 'Right arrow, ' : 'Wrong arrow, ') + name);
        } else {
          g.setAttribute('role', 'button');
          g.setAttribute('tabindex', '0');
          g.setAttribute('aria-label', 'Arrow, ' + name + '. Press Delete to remove.');
          g.addEventListener('click', function () { selectEdge(index); });
          g.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectEdge(index); }
          });
        }
      }
      return g;
    }

    function paintArrows() {
      arrowsG.textContent = '';
      var kinds = null;
      if (checked && result) {
        var wrongSet = {};
        result.wrong.forEach(function (w) { wrongSet[w[0] + '\u0000' + w[1]] = 1; });
        kinds = function (e) { return own(wrongSet, e[0] + '\u0000' + e[1]) ? 'wrong' : 'good'; };
      }
      drawn.forEach(function (e, i) {
        var n = edgeNode(e[0], e[1], kinds ? kinds(e) : '', i, hasEdge(e[1], e[0]));
        if (n) arrowsG.appendChild(n);
      });
      if (checked && result) {
        edgesOf.filter(function (e) { return result.missed.indexOf(e.id) >= 0; }).forEach(function (e) {
          var n = edgeNode(e.from, e.to, 'ghost', -1, hasEdge(e.to, e.from));
          if (n) arrowsG.appendChild(n);
        });
      }
    }

    function paintCards() {
      ids.forEach(function (id) {
        var el = cardEls[id];
        el.className = 'wb-card' + (pick === id ? ' picked' : '');
        el.setAttribute('aria-pressed', pick === id ? 'true' : 'false');
        if (checked) el.setAttribute('aria-disabled', 'true'); else el.removeAttribute('aria-disabled');
      });
    }

    function paintList() {
      listEl.textContent = '';
      if (!drawn.length) {
        listEl.appendChild(OwnIt.el('li', { 'class': 'wb-empty' }, 'No arrows yet.'));
      }
      drawn.forEach(function (e, i) {
        var li = OwnIt.el('li', { 'class': 'wb-row' + (i === sel ? ' sel' : '') });
        li.appendChild(OwnIt.el('span', { 'class': 'wb-row-text' }, L(e[0]) + ' to ' + L(e[1])));
        if (!checked) {
          var rm = OwnIt.el('button', { type: 'button', 'class': 'btn btn-quiet wb-remove', 'aria-label': 'Remove arrow ' + L(e[0]) + ' to ' + L(e[1]) }, 'Remove');
          rm.addEventListener('click', function () { removeEdge(i); });
          li.appendChild(rm);
        }
        listEl.appendChild(li);
      });
      legend.textContent = '';
      if (checked) {
        [['good', 'Right arrow'], ['ghost', 'Missing arrow'], ['wrong', 'Not in the app']].forEach(function (p) {
          var row = OwnIt.el('p', { 'class': 'wb-key' });
          row.appendChild(OwnIt.el('span', { 'class': 'wb-swatch ' + p[0], 'aria-hidden': 'true' }));
          row.appendChild(OwnIt.el('span', null, p[1]));
          legend.appendChild(row);
        });
      } else {
        legend.appendChild(OwnIt.el('p', { 'class': 'wb-key' }, plural(drawn.length, 'arrow', 'arrows') + ' drawn.'));
      }
    }

    function repaint() { paintCards(); paintArrows(); paintList(); }

    // ---- actions
    function tapCard(id) {
      if (checked || done) return;
      sel = -1;
      if (pick === null) {
        pick = id;
        say(L(id) + ' picked. Now tap the part it sends something to.');
      } else if (pick === id) {
        pick = null;
        say('Cancelled.');
      } else if (hasEdge(pick, id)) {
        say('That arrow is already drawn.');
        pick = null;
      } else {
        drawn.push([pick, id]);
        say('Arrow drawn from ' + L(pick) + ' to ' + L(id) + '.');
        OwnIt.sound('clack');
        pick = null;
      }
      repaint();
    }

    function selectEdge(i) {
      if (checked || done) return;
      pick = null;
      sel = sel === i ? -1 : i;
      if (sel >= 0) say('Arrow from ' + L(drawn[sel][0]) + ' to ' + L(drawn[sel][1]) + ' selected. Press Delete to remove it.');
      repaint();
    }

    function removeEdge(i) {
      if (checked || done || i < 0 || i >= drawn.length) return;
      var e = drawn.splice(i, 1)[0];
      sel = -1;
      say('Removed the arrow from ' + L(e[0]) + ' to ' + L(e[1]) + '.');
      repaint();
    }

    function check() {
      if (checked || done) return;
      if (!drawn.length) { say('Draw at least one arrow first.'); return; }
      var ans = getAnswer();
      if (!ans) { say("This board can't be checked. Ask Claude to rebuild it."); return; }
      edgesOf = ans.edges;
      checked = true;
      pick = null; sel = -1;
      result = OwnItCore.gradeComponent({ edges: edgesOf }, drawn);
      var perfect = result.got === result.of && !result.wrong.length;
      OwnIt.sound(perfect ? 'correct' : 'wrong');
      if (perfect && OwnIt.juice) OwnIt.juice.confetti(board);
      else if (OwnIt.juice && result.wrong.length) OwnIt.juice.shake(board);
      shell.setScore(result.got, result.of);
      say(perfect ? 'Every arrow is right.' : result.got + ' of ' + result.of + ' arrows found, ' + plural(result.wrong.length, 'arrow', 'arrows') + ' not in the app.');
      checkBtn.setAttribute('hidden', 'hidden');
      resultBtn.removeAttribute('hidden');
      if (resultBtn.focus) resultBtn.focus();
      repaint();
    }

    function finish() {
      if (done || !result) return;
      done = true;
      var review = [];
      var byEdge = {};
      edgesOf.forEach(function (e) { byEdge[e.id] = e; });
      result.missed.forEach(function (id) {
        if (own(byEdge, id)) review.push({ id: id, text: 'Missing arrow: ' + L(byEdge[id].from) + ' to ' + L(byEdge[id].to) + '.' });
      });
      result.wrong.forEach(function (w) { review.push({ text: 'Not in the app: ' + L(w[0]) + ' to ' + L(w[1]) + '.' }); });
      var xp = Math.max(0, result.got * XP_EDGE - result.wrong.length * XP_WRONG);
      kit.finish(shell, ctx, {
        game: 'whiteboard', mode: mode, got: result.got, of: result.of, xp: xp, missed: result.missed, review: review,
        extra: result.wrong.length ? { wrong: result.wrong } : null
      });
    }

    // ---- keyboard
    function moveFocus(dx, dy) {
      var cur = document.activeElement && document.activeElement.getAttribute ? document.activeElement.getAttribute('data-id') : null;
      if (!cur || !own(pos, cur)) cur = ids[0];
      if (!cur) return;
      var a = pos[cur], ax = a.x + a.w / 2, ay = a.y + a.h / 2, best = null, bestScore = Infinity;
      ids.forEach(function (id) {
        if (id === cur) return;
        var b = pos[id], vx = b.x + b.w / 2 - ax, vy = b.y + b.h / 2 - ay;
        var along = vx * dx + vy * dy, across = Math.abs(vx * dy) + Math.abs(vy * dx);
        if (along <= 0) return;
        var score = along + across * 2;
        if (score < bestScore) { bestScore = score; best = id; }
      });
      if (best && cardEls[best].focus) cardEls[best].focus();
    }

    var offs = [];
    [['ArrowLeft', -1, 0], ['ArrowRight', 1, 0], ['ArrowUp', 0, -1], ['ArrowDown', 0, 1]].forEach(function (k) {
      offs.push(ctx.keys.on(k[0], function (e) {
        if (kit.modalOpen() || !kit.mine(e, area) || done) return;
        if (e && e.preventDefault) e.preventDefault();
        moveFocus(k[1], k[2]);
      }));
    });
    ['Delete', 'Backspace'].forEach(function (k) {
      offs.push(ctx.keys.on(k, function (e) {
        if (kit.modalOpen() || !kit.mine(e, area) || sel < 0) return;
        if (e && e.preventDefault) e.preventDefault();
        removeEdge(sel);
      }));
    });

    var onResize = function () { if (!done) relayout(); };
    if (window.addEventListener) window.addEventListener('resize', onResize);

    if (cards.length < 2) {
      done = true;
      shell.stopTimer();
      board.setAttribute('hidden', 'hidden');
      actions.setAttribute('hidden', 'hidden');
      intro.textContent = 'This round has too few parts to draw.';
      live.textContent = 'Ask Claude to build a new map round, then pick it again from the board.';
    } else {
      repaint();
      relayout();
    }

    return function () {
      done = true;
      if (window.removeEventListener) window.removeEventListener('resize', onResize);
      offs.forEach(function (off) { try { off(); } catch (e) { /* gone */ } });
      shell.destroy();
    };
  }

  OwnIt.register({
    id: 'whiteboard',
    name: 'Whiteboard Map',
    minutes: 5,
    keys: [['Arrows', 'Move between parts'], ['Enter', 'Pick a part, then its target'], ['Delete', 'Remove the selected arrow'], ['H', 'Hint (costs 15 XP)'], ['Esc', 'Leave']],
    play: play
  });
})();
