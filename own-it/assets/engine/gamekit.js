/* own-it engine: shared scaffolding for question-style game templates (quiz, screen tour, guess the screen).
   OwnIt.kit: label, note, dots, answerButtons, targetIndex, choiceKeys, clock, onActivate, arrowKeys, timers, release, nextLabel, finish. Load after shell.js. */
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
      elapsed += step;
      paint();
      if (o.onTick) o.onTick(elapsed);
      if (timer && elapsed >= ms) { stop(); if (o.onEnd) o.onEnd(); }
    }, step);
    return { el: bar, stop: stop, remaining: function () { return Math.max(0, ms - elapsed); } };
  }

  /* Ends a round: stops the timer, shows the score and opens the result card with the payload.
     o: { game, mode, got, of, xp, missed: [string], review: [{text}], extra: {…merged into the payload} }. */
  function finish(shell, ctx, o) {
    shell.stopTimer();
    shell.setScore(o.got, o.of);
    var xp = Math.max(0, o.xp - shell.hintsUsed() * 15);
    return shell.result({
      got: o.got, total: o.of, xp: xp, missed: o.review,
      payload: Object.assign({ id: ctx.roundId, game: o.game, mode: o.mode, submittedAt: new Date().toISOString(), got: o.got, of: o.of, missed: o.missed, text: {}, hintsUsed: 0 }, o.extra || {})
    });
  }

  OwnIt.kit = { has: has, plural: plural, label: label, note: note, dots: dots, answerButtons: answerButtons, targetIndex: targetIndex, mine: mine,
    choiceKeys: choiceKeys, clock: clock, onActivate: onActivate, arrowKeys: arrowKeys, timers: timers, release: release, nextLabel: nextLabel, finish: finish, modalOpen: modalOpen };
})();
