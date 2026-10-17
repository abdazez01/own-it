/* own-it engine: shared scaffolding for question-style game templates (quiz, screen tour, guess the screen).
   OwnIt.kit: label, note, dots, answerButtons, targetIndex, choiceKeys, clock, onActivate, arrowKeys, gridMove, timers, release, nextLabel, lazy, verdict,
   stepper, gradeFor, asker, finish. Load after shell.js. */
(function () {
  'use strict';
  var OwnIt = (window.OwnIt = window.OwnIt || {});
  var CHOICE_KEYS = [['1', 0], ['2', 1], ['3', 2], ['4', 3], ['a', 0], ['b', 1], ['c', 2], ['d', 3]];

  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  function has(obj, key) { return !!obj && Object.prototype.hasOwnProperty.call(obj, key); }

  // The words a player sees for a model id: the round's label if it has one, else the id with separators turned into spaces.
  // Plain sentences (free-text choices) pass through. Comparisons elsewhere always stay on the id.
  function label(id, labels) {
    var t = String(id == null ? '' : id);
    if (has(labels, t) && labels[t] && typeof labels[t].label === 'string' && labels[t].label) return labels[t].label;
    if (/\s/.test(t)) return t;
    var spaced = t.replace(/[-_.]+/g, ' ').trim();
    return spaced || t;
  }

  // A line in the feedback area: a bold lead-in and a sentence.
  function note(parent, cls, lead, text) {
    var line = OwnIt.el('p', { 'class': 'quiz-why ' + cls });
    line.appendChild(OwnIt.el('strong', null, lead + ' '));
    line.appendChild(OwnIt.el('span', null, text));
    parent.appendChild(line);
    return line;
  }

  // Progress dots. paint(current, locked, noun) marks the current one and sets the spoken label. set(i, state) colours one.
  function dots(total) {
    var el = OwnIt.el('div', { 'class': 'qdots', role: 'img' });
    var items = [];
    for (var i = 0; i < total; i++) {
      var d = OwnIt.el('span', { 'class': 'qdot' });
      items.push(d);
      el.appendChild(d);
    }
    return {
      el: el,
      set: function (i, state) { if (items[i]) items[i].setAttribute('data-state', state); },
      paint: function (current, locked, noun) {
        items.forEach(function (it, i) {
          var state = it.getAttribute('data-state');
          it.className = 'qdot' + (i === current && !locked ? ' now' : '') + (state ? ' ' + state : '');
        });
        el.setAttribute('aria-label', (noun || 'Question') + ' ' + Math.min(current + 1, total) + ' of ' + total);
      }
    };
  }

  // Fills container with one numbered answer button per text. onPick(index) runs on click. Returns the buttons as an array.
  function answerButtons(container, texts, onPick) {
    container.textContent = '';
    return texts.map(function (text, i) {
      var b = OwnIt.el('button', { type: 'button', 'class': 'answer' });
      b.appendChild(OwnIt.el('span', { 'class': 'answer-key', 'aria-hidden': 'true' }, String(i + 1)));
      b.appendChild(OwnIt.el('span', { 'class': 'answer-text' }, text));
      b.addEventListener('click', function () { onPick(i); });
      container.appendChild(b);
      return b;
    });
  }

  // Index of the button an event came from, or -1.
  function targetIndex(btns, e) {
    var list = Array.prototype.slice.call(btns || []);
    return list.indexOf(e && e.target);
  }

  function modalOpen() { return !!document.body.querySelector('.scrim'); }

  // True when a key event came from the page itself or from inside the game's own area. Header buttons, toggles and
  // dialogs keep their own Enter and Space.
  function mine(e, area) {
    var t = e && e.target;
    if (!t || !t.tagName || t === document.body || t === document.documentElement) return true;
    for (var n = t; n; n = n.parentNode) if (n === area) return true;
    return false;
  }

  // 1-4 and A-D choose by index. fn(index). Pauses while a dialog is open. Returns the off functions.
  function choiceKeys(ctx, fn) {
    return CHOICE_KEYS.map(function (p) {
      return ctx.keys.on(p[0], function () { if (!modalOpen()) fn(p[1]); });
    });
  }

  // Registers a key that is paused under dialogs. For Enter and Space it also requires mine(e, area) and stops the
  // focused control's own click. fn(e) runs only when the event is ours.
  function onActivate(ctx, area, key, fn) {
    return ctx.keys.on(key, function (e) {
      if (modalOpen() || !mine(e, area)) return;
      if (e && e.preventDefault) e.preventDefault();
      fn(e);
    });
  }

  /* The four arrow keys, paused under dialogs and for events outside the game's area. fn(dx, dy) gets -1, 0 or 1 per axis
     (right is dx 1, down is dy 1); the default scroll is stopped. Returns the off functions. */
  function arrowKeys(ctx, area, fn) {
    return [['ArrowRight', 1, 0], ['ArrowLeft', -1, 0], ['ArrowDown', 0, 1], ['ArrowUp', 0, -1]].map(function (p) {
      return ctx.keys.on(p[0], function (e) {
        if (modalOpen() || !mine(e, area)) return;
        if (e && e.preventDefault) e.preventDefault();
        fn(p[1], p[2]);
      });
    });
  }

  // Index after moving one step over a grid laid out row by row in cols columns, or the same index at an edge (or past the last item).
  function gridMove(i, count, cols, dx, dy) {
    var col = (i % cols) + dx, row = Math.floor(i / cols) + dy, j = row * cols + col;
    return col < 0 || col >= cols || row < 0 || j < 0 || j >= count ? i : j;
  }

  // Pending timeouts a game owns. later(fn, ms) schedules; clear() cancels every one still waiting.
  function timers() {
    var list = [];
    return {
      later: function (fn, ms) { var t = setTimeout(function () { fn(); }, ms); list.push(t); return t; },
      clear: function () { list.forEach(function (t) { clearTimeout(t); }); list = []; }
    };
  }

  // Calls every off function a game collected from ctx.keys.on, ignoring ones already gone.
  function release(offs) {
    offs.forEach(function (off) { try { off(); } catch (e) { /* gone */ } });
  }

  // A getter that decodes an obfuscated answer the first time it is asked for, and never before. asValue(decoded) may reshape or validate it.
  function lazy(enc, asValue) {
    var got = false, value;
    return function () {
      if (!got) { value = OwnItCore.decode(enc); if (asValue) value = asValue(value); got = true; }
      return value;
    };
  }

  // Judges one allow or deny card (action, role, answer, why) against what the player said. Decodes the verdict and the reason here.
  function verdict(card, said) {
    var truth = OwnItCore.decode(card.answer);
    return { ok: truth === said, truth: truth, phrase: 'A ' + card.role + ' ' + (truth === 'allow' ? 'may' : 'may not') + ': ' + card.action + '. ' + OwnItCore.decode(card.why) };
  }

  // Walks an ordered list one id at a time. getOrder() returns the right order (see lazy). take(id) is true and advances on the next right id, false otherwise.
  function stepper(getOrder) {
    var at = 0;
    return {
      order: getOrder,
      progress: function () { return at; },
      expected: function () { return getOrder()[at]; },
      take: function (id) { if (id !== getOrder()[at]) return false; at++; return true; }
    };
  }

  // 'q2', 'Q2', 2 and '2' all mean the second question. Anything else is null.
  function qKey(q) {
    var m = /^q?(\d{1,2})$/i.exec(String(q == null ? '' : q).trim());
    return m ? 'q' + parseInt(m[1], 10) : null;
  }

  var GRADES = { solid: 1, partial: 1, miss: 1 };

  /* Reads Claude's grade for key ('q1'..). Canonical shape: {grades: {q1: 'solid'|'partial'|'miss', ...}, notes?: {q1: '...'}}.
     Older shapes still parse: {q, grade}, [{q, grade}] and {q1: 'solid'}. */
  function gradeFor(fb, key) {
    if (!fb || typeof fb !== 'object') return null;
    var found = null;
    function ok(g) { return has(GRADES, g) ? g : null; }
    if (Array.isArray(fb)) {
      fb.forEach(function (e) { if (e && qKey(e.q) === key && ok(e.grade)) found = e.grade; });
      return found;
    }
    if (has(fb, 'q') && has(fb, 'grade') && qKey(fb.q) === key) return ok(fb.grade);
    if (has(fb, 'grades')) found = gradeFor(fb.grades, key);
    if (!found && has(fb, key) && typeof fb[key] === 'string') found = ok(fb[key]);
    return found;
  }

  /* A typed answer sent to Claude as an `ask` event and graded in chat. h: { onGrade(key, grade), onUnsent() when the ask never left,
     onSkip() when no grade came within skipAfter ms (default 60000), onOffline() when the link left live mode while waiting }.
     send(key, text) returns false when there is no live link (file mode: the caller keeps the text for the result). A grade only counts when the
     link reports changed feedback data after the ask. cancel() stops waiting; release() drops the listeners. */
  function asker(ctx, h, skipAfter) {
    var link = ctx.link || null, pending = null, skipTimer = null, offs = [];
    function liveMode() { return !!link && link.mode === 'live' && typeof link.send === 'function'; }
    function settle() { pending = null; if (skipTimer) { clearTimeout(skipTimer); skipTimer = null; } }
    function unsent(p) { if (pending !== p) return; settle(); h.onUnsent(); }
    function poll(info) {
      if (!pending) return;
      if (info && typeof info.file === 'string' && info.file.indexOf('feedback-' + ctx.roundId) < 0) return;
      var fb = OwnIt.feedback ? OwnIt.feedback(ctx.roundId) : null;
      var key = pending.key, g = gradeFor(fb || ctx.feedback, key);
      if (g) { settle(); h.onGrade(key, g); }
    }
    if (link && link.onData) offs.push(link.onData(poll));
    if (link && link.onMode) offs.push(link.onMode(function (m) { if (m !== 'live' && pending) { settle(); h.onOffline(); } }));
    return {
      send: function (key, text) {
        if (!liveMode()) return false;
        var p = pending = { key: key };
        if (skipTimer) clearTimeout(skipTimer);
        skipTimer = setTimeout(function () { skipTimer = null; if (pending === p) h.onSkip(); }, skipAfter === undefined ? 60000 : skipAfter);
        var sent;
        try { sent = Promise.resolve(link.send('ask', { round: ctx.roundId, q: key, text: text })); } catch (e) { sent = Promise.resolve(false); }
        sent.then(function (okSent) { if (okSent === false) unsent(p); }, function () { unsent(p); });
        return true;
      },
      waiting: function () { return !!pending; },
      cancel: settle,
      release: function () { settle(); release(offs); }
    };
  }

  // Sets the Next/See result caption, shows the button and moves focus to it.
  function nextLabel(btn, current, total) {
    btn.textContent = current + 1 >= total ? 'See result' : 'Next';
    btn.removeAttribute('hidden');
    if (btn.focus) btn.focus();
  }

  /* A countdown with a draining bar, appended to parent. ms is the total. Plays a tick each second left inside the last
     tickFrom ms (default 5000). o: { label, spark, tickFrom, onTick(elapsedMs) every 100 ms, onEnd() when it runs out }.
     Returns { el, stop(), remaining() in ms }. stop() is safe to call twice and keeps onEnd from firing. */
  function clock(parent, ms, o) {
    o = o || {};
    var step = 100, tickFrom = o.tickFrom === undefined ? 5000 : o.tickFrom;
    var secsTotal = Math.ceil(ms / 1000), secsShown = secsTotal, elapsed = 0, timer = null;
    var bar = OwnIt.el('div', { 'class': 'cr-fuse', role: 'progressbar', 'aria-label': o.label || 'Seconds left', 'aria-valuemin': '0', 'aria-valuemax': String(secsTotal), 'aria-valuenow': String(secsTotal) });
    var line = OwnIt.el('div', { 'class': 'cr-fuse-line' });
    if (o.spark) line.appendChild(OwnIt.el('span', { 'class': 'cr-spark', 'aria-hidden': 'true' }));
    bar.appendChild(line);
    parent.appendChild(bar);
    function paint() {
      var left = Math.max(0, ms - elapsed);
      line.style.width = Math.round(left / ms * 1000) / 10 + '%';
      var secs = Math.ceil(left / 1000);
      if (secs !== secsShown) {
        secsShown = secs;
        bar.setAttribute('aria-valuenow', String(secs));
        if (secs >= 1 && secs * 1000 <= tickFrom) OwnIt.sound('tick', secs);
      }
    }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }
    paint();
    timer = setInterval(function () {
      if (OwnIt.tutorialOpen) return; // the clock waits while a tutorial is open
      elapsed += step;
      paint();
      if (o.onTick) o.onTick(elapsed);
      if (timer && elapsed >= ms) { stop(); if (o.onEnd) o.onEnd(); }
    }, step);
    return { el: bar, stop: stop, remaining: function () { return Math.max(0, ms - elapsed); } };
  }

  // The round's "where this lives" list ([{label, ref}]), decoded here and only when a round ends. Empty when the round has none.
  function whereLives(roundId) {
    try {
      var rd = OwnIt.router && OwnIt.router.resolveRound ? OwnIt.router.resolveRound(roundId) : null;
      if (!rd || typeof rd.where !== 'string') return [];
      var list = OwnItCore.decode(rd.where);
      return (Array.isArray(list) ? list : []).filter(function (x) { return x && typeof x.label === 'string' && typeof x.ref === 'string'; });
    } catch (e) { return []; }
  }

  /* Ends a round: stops the timer, shows the score and opens the result card with the payload.
     o: { game, mode, got, of, xp, missed: [string], review: [{text}], extra: {…merged into the payload} }. */
  function finish(shell, ctx, o) {
    shell.stopTimer();
    shell.setScore(o.got, o.of);
    var xp = Math.max(0, o.xp - shell.hintsUsed() * OwnIt.hintCost(ctx.roundId));
    return shell.result({
      got: o.got, total: o.of, xp: xp, missed: o.review, where: whereLives(ctx.roundId),
      payload: Object.assign({ id: ctx.roundId, game: o.game, mode: o.mode, submittedAt: new Date().toISOString(), got: o.got, of: o.of, missed: o.missed, text: {}, hintsUsed: 0 }, o.extra || {})
    });
  }

  // ---------------------------------------------------------------- coach marks, guided practice and "How to play"

  var seenMem = {};
  // True once this player has seen a game's tutorial (or the home tour, under the key 'home'). Claude may also write settings.tutorials[key].
  function tutorialSeen(key) {
    try { var st = window.OWNIT_PROGRESS && window.OWNIT_PROGRESS.settings; if (st && st.tutorials && st.tutorials[key]) return true; } catch (e) { /* none */ }
    if (seenMem[key]) return true;
    try { return !!(window.localStorage && window.localStorage.getItem('ownit-seen-' + key)); } catch (e) { return false; }
  }
  function markSeen(key) {
    seenMem[key] = true;
    try { if (window.localStorage) window.localStorage.setItem('ownit-seen-' + key, '1'); } catch (e) { /* blocked */ }
  }

  function targetsOf(t) {
    var v = typeof t === 'function' ? t() : t;
    return (Array.isArray(v) ? v : [v]).filter(function (x) { return x && x.classList; });
  }

  /* A row of coach marks. steps: [{title?, text, target?: element | [elements] | function, gated?: bool}]. A gated step hides Next: the
     caller calls api.next() when the player has done the thing. Inline (default) marks the target with .coach-spot inside o.host;
     o.float spotlights real page elements with a hole and a scrim that blocks the page. o: { host, float, label, finishLabel, onEnd(reason) }.
     Esc or Skip ends with 'skip', the last Next with 'done'. Returns { next, back, nudge(text), end(reason), index(), el }. */
  function coach(steps, o) {
    o = o || {};
    var at = 0, ended = false, spotted = [], floating = !!o.float;
    var bubble = OwnIt.el('div', { 'class': 'coach-bubble' + (floating ? ' float' : ''), role: 'group', 'aria-label': o.label || 'Guide', 'aria-live': 'polite' });
    var title = OwnIt.el('strong', { 'class': 'coach-title' });
    var text = OwnIt.el('p', { 'class': 'coach-text' });
    var nudgeEl = OwnIt.el('p', { 'class': 'coach-nudge', hidden: 'hidden' });
    var foot = OwnIt.el('div', { 'class': 'coach-foot' });
    var count = OwnIt.el('span', { 'class': 'coach-count' });
    var back = OwnIt.button('Back', 'quiet', function () { api.back(); });
    var nextBtn = OwnIt.button('Next', 'primary', function () { api.next(); });
    var skip = OwnIt.button('Skip', 'quiet', function () { api.end('skip'); });
    [count, back, skip, nextBtn].forEach(function (n) { foot.appendChild(n); });
    [title, text, nudgeEl, foot].forEach(function (n) { bubble.appendChild(n); });
    var layer = null, hole = null;
    if (floating) {
      layer = OwnIt.el('div', { 'class': 'coach-layer' });
      layer.appendChild(OwnIt.el('div', { 'class': 'coach-block' }));
      hole = OwnIt.el('div', { 'class': 'coach-hole', 'aria-hidden': 'true' });
      layer.appendChild(hole);
      layer.appendChild(bubble);
      document.body.appendChild(layer);
    } else if (o.host) {
      o.host.appendChild(bubble);
    }

    function rectOf(list) {
      var r = null;
      list.forEach(function (n) {
        var b = n.getBoundingClientRect ? n.getBoundingClientRect() : null;
        if (!b || (!b.width && !b.height)) return;
        var x2 = b.right !== undefined ? b.right : b.left + b.width, y2 = b.bottom !== undefined ? b.bottom : b.top + b.height;
        r = r ? { left: Math.min(r.left, b.left), top: Math.min(r.top, b.top), right: Math.max(r.right, x2), bottom: Math.max(r.bottom, y2) } : { left: b.left, top: b.top, right: x2, bottom: y2 };
      });
      return r;
    }
    function place() {
      if (!floating) return;
      var r = rectOf(targetsOf(steps[at].target)), pad = 8;
      var vw = window.innerWidth || 1280, vh = window.innerHeight || 800;
      if (!r) { hole.style.display = 'none'; bubble.classList.add('center'); bubble.style.left = ''; bubble.style.top = ''; return; }
      bubble.classList.remove('center');
      hole.style.display = '';
      hole.style.left = Math.max(0, r.left - pad) + 'px';
      hole.style.top = Math.max(0, r.top - pad) + 'px';
      hole.style.width = (r.right - r.left + 2 * pad) + 'px';
      hole.style.height = (r.bottom - r.top + 2 * pad) + 'px';
      var bw = Math.min(380, vw - 24), bh = bubble.offsetHeight || 170;
      var top = r.bottom + pad + 14;
      if (top + bh > vh - 12) top = Math.max(12, r.top - pad - 14 - bh);
      if (top + bh > vh - 12) top = Math.max(12, vh - bh - 12);
      bubble.style.top = top + 'px';
      bubble.style.left = Math.max(12, Math.min(r.left, vw - bw - 12)) + 'px';
    }
    function unspot() { spotted.forEach(function (n) { n.classList.remove('coach-spot'); }); spotted = []; }
    function render() {
      var s = steps[at];
      unspot();
      title.textContent = s.title || '';
      if (s.title) title.removeAttribute('hidden'); else title.setAttribute('hidden', 'hidden');
      text.textContent = s.text;
      nudgeEl.textContent = '';
      nudgeEl.setAttribute('hidden', 'hidden');
      count.textContent = (at + 1) + ' of ' + steps.length;
      if (at > 0 && !steps[at - 1].gated) back.removeAttribute('hidden'); else back.setAttribute('hidden', 'hidden');
      if (s.gated) nextBtn.setAttribute('hidden', 'hidden'); else nextBtn.removeAttribute('hidden');
      nextBtn.textContent = at === steps.length - 1 ? (o.finishLabel || 'Got it') : 'Next';
      var list = targetsOf(s.target);
      if (!floating) list.forEach(function (n) { n.classList.add('coach-spot'); spotted.push(n); });
      if (floating && list[0] && list[0].scrollIntoView) { try { list[0].scrollIntoView({ block: 'center', behavior: 'auto' }); } catch (e) { /* optional */ } }
      place();
      if (s.onShow) s.onShow(api);
      var f = s.gated && list[0] && list[0].focus ? list[0] : nextBtn;
      if (f.focus) f.focus();
    }
    bubble.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); api.end('skip'); }
      else if (e.key === 'ArrowRight' && !steps[at].gated) { e.preventDefault(); api.next(); }
      else if (e.key === 'ArrowLeft' && at > 0 && !steps[at - 1].gated) { e.preventDefault(); api.back(); }
    });
    var onSize = function () { place(); };
    if (floating && window.addEventListener) window.addEventListener('resize', onSize);

    var api = {
      el: bubble,
      index: function () { return at; },
      next: function () { if (ended) return; if (at >= steps.length - 1) api.end('done'); else { at++; render(); } },
      back: function () { if (ended || at < 1) return; at--; render(); },
      nudge: function (t) { nudgeEl.textContent = t; nudgeEl.removeAttribute('hidden'); },
      end: function (reason) {
        if (ended) return;
        ended = true;
        unspot();
        if (floating && window.removeEventListener) window.removeEventListener('resize', onSize);
        if (layer && layer.remove) layer.remove(); else if (bubble.remove) bubble.remove();
        if (o.onEnd) o.onEnd(reason);
      }
    };
    render();
    return api;
  }

  /* Guided practice on a tiny made-up board, so nothing real can be given away.
     spec: { title, board(host) -> {name: element}, steps: [{text, title?, targets?: [names], show?: [names], nudge?, nudges?: {name: text}, onHit?, onDone?(nodes)}] }.
     A step with targets is gated: the player must press all of them (any other node gets a gentle nudge). A step without targets ends the
     practice with Got it. Esc or Skip leaves. Both mark the game's tutorial as seen. opts: { game, onEnd(reason) }. */
  function tutorial(spec, opts) {
    opts = opts || {};
    var cv = null, nodes = {}, hit = {}, last = -1, closing = false;
    OwnIt.tutorialOpen = (OwnIt.tutorialOpen || 0) + 1;
    var shellApi = OwnIt.dialog(function (dlg, api) {
      dlg.classList.add('tutorial-card');
      dlg.appendChild(OwnIt.el('h2', null, spec.title || 'How to play'));
      dlg.appendChild(OwnIt.el('p', { 'class': 'note' }, 'Practice board. Nothing here comes from your app.'));
      var host = OwnIt.el('div', { 'class': 'tut-board' });
      dlg.appendChild(host);
      nodes = spec.board(host) || {};
      var guide = OwnIt.el('div', { 'class': 'tut-guide' });
      dlg.appendChild(guide);
      var steps = spec.steps.map(function (s) {
        return { title: s.title, text: s.text, gated: !!(s.targets && s.targets.length), target: (s.targets || s.show || []).map(function (n) { return nodes[n]; }) };
      });
      cv = coach(steps, { host: guide, label: 'How to play', onEnd: function (reason) {
        if (opts.game) markSeen(opts.game);
        closing = true;
        api.close();
        if (opts.onEnd) opts.onEnd(reason);
      } });
      Object.keys(nodes).filter(function (name) { return name.charAt(0) !== '_' && nodes[name] && typeof nodes[name].addEventListener === 'function'; }).forEach(function (name) {
        nodes[name].addEventListener('click', function () {
          var i = cv.index(), s = spec.steps[i];
          if (!s || !s.targets || !s.targets.length) return;
          if (s.targets.indexOf(name) < 0) {
            OwnIt.sound('hint');
            cv.nudge((s.nudges && s.nudges[name]) || s.nudge || 'Not that one. Press the part that glows.');
            return;
          }
          if (last !== i) { hit = {}; last = i; }
          if (hit[name]) return;
          hit[name] = true;
          nodes[name].classList.add('tut-done');
          OwnIt.sound('press');
          if (s.onHit) s.onHit(name, nodes);
          if (s.targets.every(function (n) { return hit[n]; })) {
            OwnIt.sound('correct');
            if (s.onDone) s.onDone(nodes);
            cv.next();
          }
        });
      });
    }, { label: spec.title || 'How to play', onClose: function () {
      OwnIt.tutorialOpen = Math.max(0, (OwnIt.tutorialOpen || 1) - 1);
      if (!closing && cv) { closing = true; cv.end('skip'); }
    } });
    return { dialog: shellApi, coach: cv, nodes: nodes };
  }

  // A one-card "How to play": the game's line and its keys.
  function howToCard(def, meta, opts) {
    OwnIt.tutorialOpen = (OwnIt.tutorialOpen || 0) + 1;
    return OwnIt.dialog(function (dlg, api) {
      dlg.classList.add('tutorial-card');
      dlg.appendChild(OwnIt.el('h2', null, 'How to play ' + ((def && def.name) || (meta && meta.name) || 'this game')));
      if (meta && meta.line) dlg.appendChild(OwnIt.el('p', null, meta.line));
      var keys = def && Array.isArray(def.keys) ? def.keys : [];
      if (keys.length) {
        dlg.appendChild(OwnIt.el('h3', { 'class': 'panel-title' }, 'Keys'));
        var list = OwnIt.el('div', { 'class': 'well' });
        keys.forEach(function (k) {
          var row = OwnIt.el('p', { 'class': 'how-key' });
          row.appendChild(OwnIt.el('kbd', null, String(k[0])));
          row.appendChild(OwnIt.el('span', null, ' ' + String(k[1] || '')));
          list.appendChild(row);
        });
        dlg.appendChild(list);
      }
      var actions = OwnIt.el('div', { 'class': 'actions' });
      actions.appendChild(OwnIt.button('Got it', 'primary', function () { api.close(); }, { 'data-autofocus': '1' }));
      dlg.appendChild(actions);
    }, { label: 'How to play', onClose: function () {
      OwnIt.tutorialOpen = Math.max(0, (OwnIt.tutorialOpen || 1) - 1);
      if (opts && opts.game) markSeen(opts.game);
      if (opts && opts.onEnd) opts.onEnd('done');
    } });
  }

  // The "How to play" for a game: its guided practice if it has one (def.tutorial), else a one-card summary.
  OwnIt.howToPlay = function (game, opts) {
    opts = Object.assign({ game: game }, opts || {});
    var def = OwnIt.games && OwnIt.games.get(game), all = window.OWNIT_GAMES, meta = null;
    if (Array.isArray(all)) all.forEach(function (m) { if (m && m.id === game) meta = m; });
    if (def && def.tutorial) return tutorial(def.tutorial, opts);
    return howToCard(def, meta, opts);
  };
  // Opens it once, the first time a game starts.
  OwnIt.autoHowTo = function (game) { if (!tutorialSeen(game)) OwnIt.howToPlay(game); };

  OwnIt.kit = { has: has, plural: plural, label: label, note: note, dots: dots, answerButtons: answerButtons, targetIndex: targetIndex, mine: mine,
    choiceKeys: choiceKeys, clock: clock, onActivate: onActivate, arrowKeys: arrowKeys, gridMove: gridMove, timers: timers, release: release, nextLabel: nextLabel, lazy: lazy, verdict: verdict, stepper: stepper,
    gradeFor: gradeFor, asker: asker, finish: finish, whereLives: whereLives, modalOpen: modalOpen,
    coach: coach, tutorial: tutorial, tutorialSeen: tutorialSeen, markSeen: markSeen };
})();
