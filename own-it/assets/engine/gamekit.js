/* own-it engine: shared scaffolding for question-style game templates (quiz, screen tour, guess the screen).
   OwnIt.kit: label, note, dots, answerButtons, targetIndex, choiceKeys, onActivate, nextLabel, finish. Load after shell.js. */
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

  // Sets the Next/See result caption, shows the button and moves focus to it.
  function nextLabel(btn, current, total) {
    btn.textContent = current + 1 >= total ? 'See result' : 'Next';
    btn.removeAttribute('hidden');
    if (btn.focus) btn.focus();
  }

  /* Ends a round: stops the timer, shows the score and opens the result card with the payload.
     o: { game, mode, got, of, xp, missed: [string], review: [{text}], extra: {…merged into the payload} }. */
  function finish(shell, ctx, o) {
    shell.stopTimer();
    shell.setScore(o.got, o.of);
    var xp = Math.max(0, o.xp - shell.hintsUsed() * 15);
    return shell.result({
      got: o.got, total: o.of, xp: xp, missed: o.review,
      payload: Object.assign({ id: ctx.roundId, game: o.game, mode: o.mode, submittedAt: new Date().toISOString(), got: o.got, of: o.of, missed: o.missed }, o.extra || {})
    });
  }

  OwnIt.kit = { has: has, plural: plural, label: label, note: note, dots: dots, answerButtons: answerButtons, targetIndex: targetIndex, mine: mine,
    choiceKeys: choiceKeys, onActivate: onActivate, nextLabel: nextLabel, finish: finish, modalOpen: modalOpen };
})();
