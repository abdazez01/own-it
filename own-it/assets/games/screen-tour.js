/* own-it game template: Screen Tour (design spec 6.2, frontend spec 6.3). One rebuilt app screen sits in a sandboxed iframe
   (OwnIt.screenhost). Steps: chain (tap an element, pick what happens), find (tap the right element), role (pick who sees it).
   Answers arrive obfuscated and are decoded only when the player answers. Builds DOM with OwnIt.el only. */
(function () {
  'use strict';
  var OwnIt = window.OwnIt;
  var LETTERS = ['A', 'B', 'C', 'D'];
  var XP_RIGHT = 10;
  var LABEL = function (t) { return OwnIt.screenhost.label(t); };

  var INSTRUCTION = {
    chain: 'Tap the highlighted spot on the screen, or use the arrow keys and Enter.',
    find: 'Tap the right spot on the screen, or use the arrow keys and Enter.',
    role: 'Pick one of the answers.'
  };

  function play(root, round, ctx) {
    var steps = (round && round.steps) || [];
    var total = steps.length;
    var exam = (round && round.mode === 'exam') || OwnIt.mode === 'exam';
    var mode = exam ? 'exam' : 'practice';

    var si = 0;
    var phase = 'tap';     // tap (waiting for a tap on the screen), choose (answers showing), locked (answered)
    var done = false;
    var got = 0;
    var missed = [];       // step indexes as strings
    var review = [];

    var shell = OwnIt.shell(root, ctx, { zone: round && round.zone, total: total, side: false });
    shell.startTimer();

    var grid = OwnIt.el('div', { 'class': 'tour-grid' });
    var screenBox = OwnIt.el('section', { 'class': 'tour-screen', 'aria-label': 'Screen copy' });
    var card = OwnIt.el('section', { 'class': 'panel tour-card' });
    var dots = OwnIt.el('div', { 'class': 'qdots', role: 'img' });
    var dotEls = [];
    for (var d = 0; d < total; d++) {
      var dot = OwnIt.el('span', { 'class': 'qdot' });
      dotEls.push(dot);
      dots.appendChild(dot);
    }
    var prompt = OwnIt.el('h2', { 'class': 'quiz-q', 'aria-live': 'polite' });
    var hint = OwnIt.el('p', { 'class': 'quiz-why tour-hint' });
    var answersEl = OwnIt.el('div', { 'class': 'answers', role: 'group', 'aria-label': 'Answers' });
    var feedback = OwnIt.el('div', { 'class': 'quiz-feedback', 'aria-live': 'polite' });
    var actions = OwnIt.el('div', { 'class': 'actions quiz-actions' });
    var nextBtn = OwnIt.button('Next', 'primary', null);
    nextBtn.setAttribute('hidden', 'hidden');
    actions.appendChild(nextBtn);
    [dots, prompt, hint, answersEl, feedback, actions].forEach(function (n) { card.appendChild(n); });
    grid.appendChild(screenBox);
    grid.appendChild(card);
    shell.area.appendChild(grid);

    var host = OwnIt.screenhost.mount(screenBox, round && round.screen);
    if (!host.ok) hint.textContent = 'The screen copy is missing, so you can only answer from what you know.';

    function setDots() {
      dotEls.forEach(function (el, i) {
        var state = el.getAttribute('data-state');
        el.className = 'qdot' + (i === si && phase !== 'locked' ? ' now' : '') + (state ? ' ' + state : '');
      });
      dots.setAttribute('aria-label', 'Step ' + Math.min(si + 1, total) + ' of ' + total);
    }

    function showChoices(step) {
      phase = 'choose';
      answersEl.textContent = '';
      answersEl.removeAttribute('hidden');
      var mine = si;
      (step.choices || []).slice(0, 4).forEach(function (c, i) {
        var b = OwnIt.el('button', { type: 'button', 'class': 'answer' });
        b.appendChild(OwnIt.el('span', { 'class': 'answer-key', 'aria-hidden': 'true' }, String(i + 1)));
        b.appendChild(OwnIt.el('span', { 'class': 'answer-text' }, LABEL(c)));
        b.addEventListener('click', function () { choose(mine, i); });
        answersEl.appendChild(b);
      });
      hint.textContent = INSTRUCTION.role;
      var first = answersEl.querySelector('.answer');
      if (first && first.focus) first.focus();
    }

    function render() {
      var step = steps[si];
      host.clear();
      phase = 'tap';
      answersEl.textContent = '';
      answersEl.setAttribute('hidden', 'hidden');
      feedback.textContent = '';
      nextBtn.setAttribute('hidden', 'hidden');
      prompt.textContent = step.prompt;
      hint.textContent = INSTRUCTION[step.kind] || INSTRUCTION.find;
      if (step.kind === 'role' || (step.kind === 'chain' && !step.element)) showChoices(step);
      else if (step.kind === 'chain' && step.element) host.highlight(step.element, '1');
      setDots();
    }

    function note(cls, label, text) {
      var line = OwnIt.el('p', { 'class': 'quiz-why ' + cls });
      line.appendChild(OwnIt.el('strong', null, label + ' '));
      line.appendChild(OwnIt.el('span', null, text));
      feedback.appendChild(line);
    }

    function settle(ok, rightLabel) {
      var step = steps[si];
      phase = 'locked';
      if (ok) got++; else missed.push(String(si));
      if (!ok) review.push({ text: 'Step ' + (si + 1) + ': ' + step.prompt + ' Answer: ' + rightLabel + '.' });
      dotEls[si].setAttribute('data-state', exam ? 'set' : ok ? 'ok' : 'bad');
      if (exam) {
        note('locked', 'Locked in.', 'Answers show at the end.');
      } else if (ok) {
        OwnIt.sound('correct');
        OwnIt.juice.confetti(card);
        shell.setScore(got, total);
        feedback.appendChild(OwnIt.el('p', { 'class': 'quiz-xp' }, '+' + XP_RIGHT + ' XP'));
        note('good', 'Right.', rightLabel);
      } else {
        OwnIt.sound('wrong');
        OwnIt.juice.shake(card);
        note('bad', 'Not quite.', 'The answer was: ' + rightLabel);
      }
      nextBtn.textContent = si + 1 >= total ? 'See result' : 'Next';
      nextBtn.removeAttribute('hidden');
      nextBtn.focus();
      setDots();
    }

    function choose(at, choice) {
      var step = steps[si];
      if (done || phase !== 'choose' || at !== si) return;
      var choices = (step.choices || []).slice(0, 4);
      if (choice < 0 || choice >= choices.length) return;
      var right = OwnItCore.decode(step.answer); // the only place an answer is decoded
      var ok = choices[choice] === right;
      var btns = answersEl.querySelectorAll('.answer');
      btns.forEach(function (b) { b.setAttribute('aria-disabled', 'true'); });
      btns[choice].classList.add('picked');
      var rightAt = choices.indexOf(right);
      if (!exam) {
        if (rightAt >= 0) btns[rightAt].classList.add('right');
        if (!ok) btns[choice].classList.add('wrong');
      }
      settle(ok, LABEL(right));
    }

    function tapped(id) {
      var step = steps[si];
      if (done || !step || phase === 'locked' || phase === 'choose') return;
      if (step.kind === 'chain') {
        if (id !== step.element) {
          hint.textContent = 'Not that one. Tap the highlighted spot.';
          return;
        }
        host.highlight(id, 'ok');
        showChoices(step);
        return;
      }
      if (step.kind === 'find') {
        var right = OwnItCore.decode(step.answer); // the only place an answer is decoded
        var ok = id === right;
        if (ok || exam) host.highlight(exam ? id : right, exam ? '1' : 'ok');
        if (!ok && !exam) { host.highlight(id, 'bad'); host.highlight(right, 'ok', true); }
        settle(ok, LABEL(right));
      }
    }
    host.onPick(tapped);

    function next(at) {
      if (done || phase !== 'locked' || at !== si) return;
      if (si + 1 >= total) return finish();
      si++;
      render();
    }

    function finish() {
      done = true;
      shell.stopTimer();
      shell.setScore(got, total);
      var xp = Math.max(0, got * XP_RIGHT - shell.hintsUsed() * 15);
      shell.result({
        got: got, total: total, xp: xp, missed: review,
        payload: { id: ctx.roundId, game: 'screen-tour', mode: mode, submittedAt: new Date().toISOString(), got: got, of: total, missed: missed }
      });
    }

    nextBtn.addEventListener('click', function () { next(si); });

    var offs = [];
    function onKey(fn) { return function (e) { if (!document.body.querySelector('.scrim')) fn(e); }; }
    [['1', 0], ['2', 1], ['3', 2], ['4', 3], ['a', 0], ['b', 1], ['c', 2], ['d', 3]].forEach(function (p) {
      offs.push(ctx.keys.on(p[0], onKey(function () { choose(si, p[1]); })));
    });
    offs.push(ctx.keys.on('n', onKey(function () { next(si); })));
    [['ArrowRight', 1], ['ArrowDown', 1], ['ArrowLeft', -1], ['ArrowUp', -1]].forEach(function (p) {
      offs.push(ctx.keys.on(p[0], onKey(function (e) {
        if (phase !== 'tap') return;
        if (e && e.preventDefault) e.preventDefault();
        host.move(p[1]);
      })));
    });
    offs.push(ctx.keys.on('Enter', onKey(function (e) {
      if (e && e.preventDefault) e.preventDefault(); // stops a focused button's own click from firing a second time
      if (phase === 'locked') return next(si);
      if (phase === 'tap') { host.pickCurrent(); return; }
      var btns = answersEl.querySelectorAll('.answer');
      for (var i = 0; i < btns.length; i++) if (btns[i] === (e && e.target)) return choose(si, i);
    })));

    if (total) render();
    else {
      done = true;
      shell.stopTimer();
      prompt.textContent = 'This round has no steps.';
      hint.textContent = 'Ask Claude to build a new screen tour round, then pick it again from the board.';
      dots.setAttribute('hidden', 'hidden');
    }

    return function () {
      done = true;
      offs.forEach(function (off) { try { off(); } catch (e) { /* gone */ } });
      host.destroy();
      shell.destroy();
    };
  }

  OwnIt.register({
    id: 'screen-tour',
    name: 'Screen Tour',
    minutes: 4,
    keys: [['Arrows', 'Move between spots on the screen'], ['Enter', 'Tap the spot, then next'], ['1-4', 'Answer'], ['A-D', 'Answer'], ['N', 'Next step'], ['Esc', 'Leave']],
    play: play
  });
})();
