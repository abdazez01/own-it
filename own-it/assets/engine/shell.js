/* own-it engine: game shell (frontend spec 6.2), logo renderer (5.4), result card (5.13), hint dialog (5.16),
   leave confirm, and the "Claude is building your round" state (5.15). Load after flap.js, juice.js, keys.js, icons.js. */
(function () {
  'use strict';
  var OwnIt = (window.OwnIt = window.OwnIt || {});
  var NS = 'http://www.w3.org/2000/svg';

  // ---------------------------------------------------------------- logo: a tiny safe SVG reader

  var TAGS = { path: 1, circle: 1, rect: 1, line: 1, polyline: 1, ellipse: 1, g: 1 };
  var HEX = /^(none|currentColor|#[0-9a-fA-F]{3,8})$/, NUM = /^-?[\d.]+%?$/;
  var ATTRS = { d: /^[\d\sMmLlHhVvCcSsQqTtAaZz.,eE+-]+$/, points: /^[\d\s.,-]+$/, 'stroke-dasharray': /^[\d\s.,]+$/, 'stroke-width': NUM,
    transform: /^[\w\s().,-]+$/, stroke: HEX, fill: HEX,
    cx: NUM, cy: NUM, r: NUM, x: NUM, y: NUM, width: NUM, height: NUM, rx: NUM, ry: NUM, x1: NUM, y1: NUM, x2: NUM, y2: NUM };

  function svgNode(tag) {
    return document.createElementNS ? document.createElementNS(NS, tag) : document.createElement(tag);
  }

  // Builds an <svg> from a restricted inline string. Unknown tags and attributes are dropped.
  function parseSvg(src) {
    var svg = svgNode('svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    var stack = [svg];
    var re = /<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g, m;
    while ((m = re.exec(String(src || '')))) {
      var closing = m[1] === '/', tag = m[2].toLowerCase(), selfClose = m[4] === '/';
      if (tag === 'svg') continue;
      if (closing) { if (stack.length > 1) stack.pop(); continue; }
      if (!Object.prototype.hasOwnProperty.call(TAGS, tag)) continue;
      var node = svgNode(tag);
      var ar = /([\w-]+)="([^"]*)"/g, a;
      while ((a = ar.exec(m[3]))) if (Object.prototype.hasOwnProperty.call(ATTRS, a[1]) && ATTRS[a[1]].test(a[2])) node.setAttribute(a[1], a[2]);
      stack[stack.length - 1].appendChild(node);
      if (tag === 'g' && !selfClose) stack.push(node);
    }
    return svg;
  }
  OwnIt.parseSvg = parseSvg;

  // A 44px flap tile (class logo-tile) holding the game's mark.
  OwnIt.logo = function (meta) {
    var tile = OwnIt.el('span', { 'class': 'logo-tile', 'aria-hidden': 'true' });
    if (meta && meta.logo) tile.appendChild(parseSvg(meta.logo));
    return tile;
  };

  // ---------------------------------------------------------------- flap value updates without a full re-flap

  // Changes only the tiles whose glyph changed, with a flip. Falls back to a full flap when the length changes.
  OwnIt.flapSet = function (el, text) {
    var str = String(text);
    var tiles = el.children || [];
    if (!el.classList.contains('flap') || tiles.length !== Array.from(str).length) {
      OwnIt.flap(el, str);
      return el;
    }
    el.setAttribute('aria-label', str);
    Array.from(str).forEach(function (ch, i) {
      var t = tiles[i], g = ch.toUpperCase();
      if (t.textContent === g) return;
      t.textContent = g;
      if (OwnIt.reduced()) return;
      t.classList.remove('flip');
      void t.offsetWidth;
      t.classList.add('flip');
    });
    return el;
  };

  // ---------------------------------------------------------------- dialogs

  var openDialogs = [];

  // Modal with focus trap and focus return. Returns {close, dlg, scrim}.
  function dialog(build, opts) {
    opts = opts || {};
    var back = document.activeElement || null;
    var scrim = OwnIt.el('div', { 'class': 'scrim' });
    var dlg = OwnIt.el('div', { 'class': 'dialog glass-2', role: 'dialog', 'aria-modal': 'true' });
    if (opts.label) dlg.setAttribute('aria-label', opts.label);
    scrim.appendChild(dlg);
    var closed = false;
    var api = {
      dlg: dlg, scrim: scrim,
      close: function () {
        if (closed) return;
        closed = true;
        var i = openDialogs.indexOf(api);
        if (i >= 0) openDialogs.splice(i, 1);
        if (scrim.remove) scrim.remove();
        if (back && back.focus) back.focus();
        if (opts.onClose) opts.onClose();
      }
    };
    build(dlg, api);
    dlg.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (opts.escape !== false) api.close(); return; }
      if (e.key !== 'Tab') return;
      var f = Array.prototype.filter.call(dlg.querySelectorAll('button, input, textarea'), function (x) {
        return x.getAttribute('tabindex') !== '-1' && !x.hasAttribute('hidden');
      });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    document.body.appendChild(scrim);
    openDialogs.push(api);
    var focus = dlg.querySelector('[data-autofocus]') || dlg.querySelector('button');
    if (focus && focus.focus) focus.focus();
    return api;
  }
  OwnIt.dialog = dialog;

  function button(label, kind, onClick, extra) {
    var attrs = { type: 'button', 'class': 'btn btn-' + kind };
    if (extra) Object.keys(extra).forEach(function (k) { attrs[k] = extra[k]; });
    var b = OwnIt.el('button', attrs, label);
    if (onClick) b.addEventListener('click', onClick);
    return b;
  }
  OwnIt.button = button;

  // "Leave this game?" (6.2)
  function confirmLeave(onLeave) {
    return dialog(function (dlg, api) {
      dlg.appendChild(OwnIt.el('h2', null, 'Leave this game?'));
      dlg.appendChild(OwnIt.el('p', null, 'Progress in this round is lost.'));
      var actions = OwnIt.el('div', { 'class': 'actions' });
      actions.appendChild(button('Leave', 'secondary', function () { api.close(); onLeave(); }));
      var keep = button('Keep playing', 'primary', function () { api.close(); }, { 'data-autofocus': '1' });
      actions.appendChild(keep);
      dlg.appendChild(actions);
    }, { label: 'Leave this game' });
  }

  // Difficulty level: the dashboard stores it in progress settings. Custom plays at its base level. Absent means medium.
  var LEVEL_IDS = ['easy', 'medium', 'hard', 'impossible'];
  var HINT_COST = { easy: 0, medium: 15, hard: 30, impossible: 0 };
  // The round's own level (stamped by build-round) wins over settings, which may be stale. Custom plays at its base.
  OwnIt.level = function (roundId) {
    var rounds = window.OWNIT_ROUNDS, rd = roundId && rounds && typeof rounds === 'object' ? rounds[roundId] : null;
    var p = window.OWNIT_PROGRESS, st = rd && rd.level ? rd : (p && p.settings ? p.settings : {});
    var id = st.level === 'custom' ? st.levelBase : st.level;
    return LEVEL_IDS.indexOf(id) >= 0 ? id : 'medium';
  };
  // XP one hint costs at the round's level.
  OwnIt.hintCost = function (roundId) { return HINT_COST[OwnIt.level(roundId)]; };

  // Hint (5.16): costs XP, answer is one sentence labelled as a prediction.
  function hintDialog(getHint, cost) {
    return dialog(function (dlg, api) {
      dlg.appendChild(OwnIt.el('h2', null, cost ? 'Use a hint? It costs ' + cost + ' XP.' : 'Use a hint? It is free.'));
      var actions = OwnIt.el('div', { 'class': 'actions' });
      actions.appendChild(button('Not now', 'quiet', function () { api.close(); }));
      var show = button('Show hint', 'primary', function () {
        var text = getHint ? getHint() : '';
        OwnIt.sound('hint');
        dlg.textContent = '';
        dlg.appendChild(OwnIt.el('h2', null, 'Hint'));
        dlg.appendChild(OwnIt.el('p', null, text || 'No hint for this one.'));
        dlg.appendChild(OwnIt.el('p', { 'class': 'note' }, 'Prediction, may be wrong'));
        var a2 = OwnIt.el('div', { 'class': 'actions' });
        a2.appendChild(button('Got it', 'primary', function () { api.close(); }, { 'data-autofocus': '1' }));
        dlg.appendChild(a2);
        var b = dlg.querySelector('button');
        if (b && b.focus) b.focus();
      }, { 'data-autofocus': '1' });
      actions.appendChild(show);
      dlg.appendChild(actions);
    }, { label: 'Hint' });
  }

  // ---------------------------------------------------------------- the shell

  function fmtTime(s) {
    s = Math.max(0, s | 0);
    var m = Math.floor(s / 60), r = s % 60;
    return (m < 10 ? '0' : '') + m + ':' + (r < 10 ? '0' : '') + r;
  }

  function metaFor(id) {
    var all = window.OWNIT_GAMES;
    if (Array.isArray(all)) for (var i = 0; i < all.length; i++) if (all[i] && all[i].id === id) return all[i];
    return null;
  }

  function zoneName(zone) {
    var p = window.OWNIT_PROGRESS;
    var zs = p && p.zones;
    if (zs && zone != null && Object.prototype.hasOwnProperty.call(zs, zone) && zs[zone].name) return zs[zone].name;
    return zone || '';
  }

  /* OwnIt.shell(root, ctx, opts) wraps a template's play area.
     opts: { zone, total, hint: function () -> string, side: false, timer: false }
     Returns { area, side, setScore(got, total), startTimer(), stopTimer(), seconds(), result(opts), destroy() } */
  OwnIt.shell = function (root, ctx, opts) {
    opts = opts || {};
    var meta = metaFor(ctx.game) || { id: ctx.game, name: ctx.game };
    var def = OwnIt.games && OwnIt.games.get(ctx.game);
    var name = (def && def.name) || meta.name;
    root.textContent = '';
    var wrap = OwnIt.el('div', { 'class': 'wrap shell-wrap' });
    var head = OwnIt.el('header', { 'class': 'header shell-head' });
    head.appendChild(OwnIt.logo(meta));
    var title = OwnIt.el('h1', { 'class': 'shell-title' });
    title.appendChild(OwnIt.el('span', null, name));
    if (opts.zone) title.appendChild(OwnIt.el('span', { 'class': 'zone' }, ' · ' + zoneName(opts.zone)));
    head.appendChild(title);
    head.appendChild(OwnIt.el('span', { 'class': 'grow' }));

    var timerEl = null, scoreEl = null;
    if (opts.timer !== false || OwnIt.level(ctx.roundId) === 'impossible') {
      var tw = OwnIt.el('div', { 'class': 'flap-label' });
      tw.appendChild(OwnIt.el('span', null, 'Time'));
      timerEl = OwnIt.el('span');
      tw.appendChild(timerEl);
      head.appendChild(tw);
      OwnIt.flap(timerEl, '00:00');
    }
    var sw = OwnIt.el('div', { 'class': 'flap-label' });
    sw.appendChild(OwnIt.el('span', null, 'Score'));
    scoreEl = OwnIt.el('span');
    sw.appendChild(scoreEl);
    head.appendChild(sw);
    OwnIt.flap(scoreEl, '0/' + (opts.total != null ? opts.total : 0));

    var noHints = OwnIt.mode === 'exam' || OwnIt.level(ctx.roundId) === 'impossible';
    var hintBtn = button('Hint', 'secondary', function () { openHint(); }, noHints ? { disabled: 'disabled', title: 'Hints are off in this mode.' } : null);
    if (!opts.hint) hintBtn.setAttribute('hidden', 'hidden');
    head.appendChild(hintBtn);
    var helpBtn = OwnIt.el('button', { type: 'button', 'class': 'icon-btn', 'aria-label': 'Keyboard help' });
    helpBtn.appendChild(OwnIt.icons.svg('help'));
    helpBtn.addEventListener('click', function () { OwnIt.keys.help(); });
    head.appendChild(helpBtn);
    var exitBtn = button('Exit', 'secondary', function () { leave(); });
    head.appendChild(exitBtn);
    wrap.appendChild(head);

    var body = OwnIt.el('div', { 'class': 'shell' });
    var area = OwnIt.el('main', { 'class': 'play-area' });
    body.appendChild(area);
    var side = null;
    if (opts.side !== false) {
      side = OwnIt.el('aside', { 'class': 'side', 'aria-label': 'Side panel' });
      body.appendChild(side);
    }
    wrap.appendChild(body);
    root.appendChild(wrap);

    function leave() {
      if (openDialogs.length) return;
      confirmLeave(function () { ctx.router.go('home'); });
    }
    var hints = 0;
    function openHint() {
      if (!opts.hint || OwnIt.mode === 'exam' || OwnIt.level(ctx.roundId) === 'impossible') return;
      hintDialog(function () {
        hints++;
        if (OwnIt.link && OwnIt.link.mode === 'live') OwnIt.link.send('hint', { round: ctx.roundId });
        return opts.hint();
      });
    }
    var offs = [];
    if (ctx.keys) {
      offs.push(ctx.keys.on('Escape', leave));
      offs.push(ctx.keys.on('h', openHint));
    }

    var secs = 0, tick = null;
    var api = {
      area: area, side: side, header: head,
      setScore: function (got, total) { OwnIt.flapSet(scoreEl, got + '/' + total); },
      startTimer: function () {
        if (tick || !timerEl) return;
        tick = setInterval(function () { secs++; OwnIt.flapSet(timerEl, fmtTime(secs)); }, 1000);
      },
      stopTimer: function () { if (tick) { clearInterval(tick); tick = null; } },
      seconds: function () { return secs; },
      hintsUsed: function () { return hints; },
      result: function (r) {
        r = Object.assign({}, r);
        if (r.payload) r.payload = Object.assign({ text: {} }, r.payload, { hintsUsed: hints });
        return OwnIt.resultCard(ctx, r);
      },
      destroy: function () {
        api.stopTimer();
        offs.forEach(function (off) { try { off(); } catch (e) { /* gone */ } });
      }
    };
    return api;
  };

  // ---------------------------------------------------------------- result card (5.13)

  var REF = /^[A-Za-z0-9_@./-]+:\d+$/;
  function encodePath(p) { return p.split('/').map(encodeURIComponent).join('/'); }
  // 'path:line' becomes a vscode link only when the path is relative, has no '..', and a project root is known.
  function refNode(ref) {
    var root = typeof window.OWNIT_ROOT === 'string' ? window.OWNIT_ROOT.replace(/\\/g, '/').replace(/\/+$/, '') : '';
    var ok = REF.test(ref) && ref.charAt(0) !== '/' && ref.indexOf('..') < 0 && root.length > 0 && !/[\x00-\x1f]/.test(root);
    if (!ok) return OwnIt.el('code', null, ref);
    var at = ref.lastIndexOf(':');
    var href = 'vscode://file/' + encodePath(root).replace(/%3A/g, ':').replace(/^\/+/, '') + '/' + encodePath(ref.slice(0, at)) + ':' + ref.slice(at + 1);
    var a = OwnIt.el('a', { href: href, 'class': 'ref' });
    a.appendChild(OwnIt.el('code', null, ref));
    return a;
  }

  /* r: { got, total, xp, badges: [string], missed: [{id, text, ref}], banner: 'RUNG CLEARED' | 'ZONE CLAIMED',
          payload: object sent with the result event, onNext(), nextLabel } */
  OwnIt.resultCard = function (ctx, r) {
    r = r || {};
    var sent = false;
    if (r.payload && ctx && ctx.finish) { sent = true; ctx.finish(r.payload); }
    var dlgApi = dialog(function (dlg, api) {
      dlg.classList.add('result-card');
      if (r.banner) {
        var banner = OwnIt.el('div', { 'class': 'banner' });
        dlg.appendChild(banner);
        OwnIt.flap(banner, r.banner, { variant: 'ok' });
      }
      var score = OwnIt.el('div', { 'class': 'big-score' });
      dlg.appendChild(score);
      OwnIt.flap(score, (r.got | 0) + '/' + (r.total | 0));
      score.classList.add('lg');
      var xpRow = OwnIt.el('div', { 'class': 'flap-label' });
      xpRow.appendChild(OwnIt.el('span', null, 'XP gained'));
      var xpEl = OwnIt.el('span');
      xpRow.appendChild(xpEl);
      dlg.appendChild(xpRow);
      var gained = Math.max(0, r.xp | 0), shown = 0;
      OwnIt.flap(xpEl, '+0');
      if (gained > 0) {
        var steps = OwnIt.reduced() ? 1 : 12, n = 0;
        var roll = setInterval(function () {
          n++;
          shown = Math.round(gained * Math.min(1, n / steps));
          OwnIt.flapSet(xpEl, '+' + shown);
          if (n >= steps) clearInterval(roll);
        }, 60);
      }
      (r.badges || []).forEach(function (b) {
        var row = OwnIt.el('div', { 'class': 'well badge-row' });
        row.appendChild(OwnIt.el('strong', null, 'New badge'));
        row.appendChild(OwnIt.el('span', null, ' ' + b));
        dlg.appendChild(row);
      });
      if (r.missed && r.missed.length) {
        dlg.appendChild(OwnIt.el('h3', { 'class': 'panel-title' }, 'What you missed'));
        r.missed.forEach(function (m) {
          var row = OwnIt.el('div', { 'class': 'well missed-row' });
          row.appendChild(OwnIt.el('span', null, m.text));
          if (m.ref) row.appendChild(refNode(m.ref));
          if (m.id) {
            row.appendChild(button('Challenge', 'quiet', function () {
              if (OwnIt.link) OwnIt.link.send('challenge', { id: ctx.roundId, item: m.id });
            }));
          }
          dlg.appendChild(row);
        });
      }
      var actions = OwnIt.el('div', { 'class': 'actions' });
      actions.appendChild(button('Back to board', 'secondary', function () { api.close(); ctx.router.go('home'); }));
      if (r.onNext) actions.appendChild(button(r.nextLabel || 'Next game', 'primary', function () { api.close(); r.onNext(); }, { 'data-autofocus': '1' }));
      dlg.appendChild(actions);
    }, { label: 'Result', escape: false });
    if (r.banner) {
      OwnIt.sound(/CLAIM/.test(r.banner) ? 'claim' : 'levelup');
      if (OwnIt.juice) OwnIt.juice.confetti(dlgApi.dlg);
    }
    return { dialog: dlgApi, sent: sent };
  };

  // ---------------------------------------------------------------- building state (5.15)

  var stopBuilding = null;

  /* Shows a skeleton of the target game while Claude builds the round. When data arrives and a round exists,
     opts.onReady() runs. opts: { game, zone, name, onReady(), onBack(), onCopy() } */
  OwnIt.building = function (mount, opts) {
    if (stopBuilding) stopBuilding();
    mount.textContent = '';
    var wrap = OwnIt.el('div', { 'class': 'wrap building' });
    var panel = OwnIt.el('section', { 'class': 'panel', 'aria-live': 'polite' });
    var flapLine = OwnIt.el('div', { 'class': 'building-flap' });
    panel.appendChild(flapLine);
    OwnIt.flap(flapLine, 'BUILDING...');
    panel.appendChild(OwnIt.el('p', null, 'Claude is building your ' + (opts.name || 'round') + ' round.'));
    ['60%', '90%', '75%'].forEach(function (w) {
      var s = OwnIt.el('div', { 'class': 'skeleton' });
      s.style.height = '44px';
      s.style.width = w;
      s.style.marginTop = '12px';
      panel.appendChild(s);
    });
    var note = OwnIt.el('p', { 'class': 'building-note' });
    panel.appendChild(note);
    var actions = OwnIt.el('div', { 'class': 'actions row' });
    var back = button('Back to board', 'secondary', function () { stop(); opts.onBack(); });
    actions.appendChild(back);
    var paste = button('Use copy and paste instead', 'quiet', function () { opts.onCopy(); });
    paste.setAttribute('hidden', 'hidden');
    actions.appendChild(paste);
    panel.appendChild(actions);
    wrap.appendChild(panel);
    mount.appendChild(wrap);

    OwnIt.sound('build-wait');
    var t20 = setTimeout(function () { note.textContent = 'Taking longer than usual. You can keep browsing.'; }, 20000);
    var t120 = setTimeout(function () {
      note.textContent = 'Still waiting on Claude. Check the chat.';
      paste.removeAttribute('hidden');
    }, 120000);
    var off = null;
    if (OwnIt.link && OwnIt.link.onData) {
      off = OwnIt.link.onData(function () { if (opts.isReady && opts.isReady()) { stop(); opts.onReady(); } });
    }
    function stop() {
      clearTimeout(t20); clearTimeout(t120);
      if (off) { try { off(); } catch (e) { /* gone */ } off = null; }
      if (OwnIt.audio && OwnIt.audio.stop) OwnIt.audio.stop('build-wait');
      if (stopBuilding === stop) stopBuilding = null;
    }
    stopBuilding = stop;
    return stop;
  };
  OwnIt.stopBuilding = function () { if (stopBuilding) stopBuilding(); };
})();
