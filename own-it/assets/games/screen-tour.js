/* own-it game template: Screen Tour (design spec 6.2, frontend spec 6.3). One rebuilt app screen sits in a sandboxed iframe
   (OwnIt.screenhost). Steps: chain (tap an element, pick what happens), find (tap the right element), role (pick who sees it).
   Answers arrive obfuscated and are decoded only when the player answers. If the screen is missing or an element is not tagged,
   the step falls back to its choices, or to a Skip button that scores 0. Builds DOM with OwnIt.el only. */
(function () {
  'use strict';
  var OwnIt = window.OwnIt;
  var kit = OwnIt.kit;
  var XP_RIGHT = 10;

  var INSTRUCTION = {
    chain: 'Tap the highlighted spot on the screen, or press Enter.',
    find: 'Tap the right spot on the screen, or use the arrow keys and Enter.',
    role: 'Pick one of the answers.'
  };

  function play(root, round, ctx) {
    var steps = (round && round.steps) || [];
    var total = steps.length;
    var labels = round && round.labels;
    var exam = (round && round.mode === 'exam') || OwnIt.mode === 'exam';
    var mode = exam ? 'exam' : 'practice';
    var L = function (id) { return kit.label(id, labels); };

    var si = 0;
    var phase = 'tap';     // tap (waiting for a tap on the screen), choose (answers showing), locked (answered)
    var done = false;
    var got = 0;
    var missed = [];       // step indexes as strings
    var review = [];

    var shell = OwnIt.shell(root, ctx, { zone: round && round.zone, total: total, side: false });
    shell.setScore(0, total);
    shell.startTimer();
    var area = shell.area;

    var grid = OwnIt.el('div', { 'class': 'tour-grid' });
    var screenBox = OwnIt.el('section', { 'class': 'tour-screen', 'aria-label': 'Screen copy' });
    var card = OwnIt.el('section', { 'class': 'panel tour-card', tabindex: '-1' });
    var dots = kit.dots(total);
    var prompt = OwnIt.el('h2', { 'class': 'quiz-q', 'aria-live': 'polite' });
    var hint = OwnIt.el('p', { 'class': 'quiz-why tour-hint' });
    var answersEl = OwnIt.el('div', { 'class': 'answers', role: 'group', 'aria-label': 'Answers' });
    var feedback = OwnIt.el('div', { 'class': 'quiz-feedback', 'aria-live': 'polite' });
    var actions = OwnIt.el('div', { 'class': 'actions quiz-actions' });
    var skipBtn = OwnIt.button('Skip this one', 'quiet', null, { 'class': 'btn btn-quiet tour-skip' });
    var nextBtn = OwnIt.button('Next', 'primary', null);
    nextBtn.setAttribute('hidden', 'hidden');
    actions.appendChild(skipBtn);
    actions.appendChild(nextBtn);
    [dots.el, prompt, hint, answersEl, feedback, actions].forEach(function (n) { card.appendChild(n); });
    grid.appendChild(screenBox);
    grid.appendChild(card);
    area.appendChild(grid);

    var host = OwnIt.screenhost.mount(screenBox, round && round.screen);

    function setDots() { dots.paint(si, phase === 'locked', 'Step'); }

    function showChoices(step) {
      phase = 'choose';
      skipBtn.setAttribute('hidden', 'hidden');
      answersEl.removeAttribute('hidden');
      var at = si;
      var btns = kit.answerButtons(answersEl, (step.choices || []).slice(0, 4).map(L), function (i) { choose(at, i); });
      hint.textContent = INSTRUCTION.role;
      if (btns[0] && btns[0].focus) btns[0].focus();
    }

    // The tap target cannot be used (no screen, or the element is not tagged): go straight to the choices, or offer Skip.
    function degrade(step, at) {
      if (done || at !== si || phase !== 'tap') return;
      if (step.kind === 'chain' && step.choices && step.choices.length) showChoices(step);
      else hint.textContent = 'This spot is not on the screen copy. You can skip this one.';
    }

    function render() {
      var step = steps[si];
      host.clear();
      phase = 'tap';
      answersEl.textContent = '';
      answersEl.setAttribute('hidden', 'hidden');
      feedback.textContent = '';
      nextBtn.setAttribute('hidden', 'hidden');
      skipBtn.removeAttribute('hidden');
      prompt.textContent = step.prompt;
      hint.textContent = INSTRUCTION[step.kind] || INSTRUCTION.find;
      var at = si;
      if (step.kind === 'role') showChoices(step);
      else if (!host.ok) degrade(step, at);
      else {
        if (step.kind === 'chain' && step.element) host.highlight(step.element, '1');
        host.onReady(function () {
          if (step.kind === 'chain' && !(step.element && host.has(step.element))) degrade(step, at);
          else if (step.kind === 'find' && !host.ids().length) degrade(step, at);
        });
      }
      setDots();
    }

    function settle(ok, rightLabel) {
      var step = steps[si];
      phase = 'locked';
      skipBtn.setAttribute('hidden', 'hidden');
      if (ok) got++; else missed.push(String(si));
      if (!ok) review.push({ text: 'Step ' + (si + 1) + ': ' + step.prompt + ' Answer: ' + rightLabel + '.' });
      dots.set(si, exam ? 'set' : ok ? 'ok' : 'bad');
      if (exam) {
        kit.note(feedback, 'locked', 'Locked in.', 'Answers show at the end.');
      } else if (ok) {
        OwnIt.sound('correct');
        OwnIt.juice.confetti(card);
        shell.setScore(got, total);
        feedback.appendChild(OwnIt.el('p', { 'class': 'quiz-xp' }, '+' + XP_RIGHT + ' XP'));
        kit.note(feedback, 'good', 'Right.', rightLabel);
      } else {
        OwnIt.sound('wrong');
        OwnIt.juice.shake(card);
        kit.note(feedback, 'bad', 'Not quite.', 'The answer was: ' + rightLabel);
      }
      kit.nextLabel(nextBtn, si, total);
      setDots();
    }

    function choose(at, choice) {
      var step = steps[si];
      if (done || phase !== 'choose' || at !== si) return;
      var choices = (step.choices || []).slice(0, 4);
      if (choice < 0 || choice >= choices.length) return;
      var right = OwnItCore.decode(step.answer); // the only place an answer is decoded
      var ok = choices[choice] === right;
      var btns = Array.from(answersEl.querySelectorAll('.answer'));
      btns.forEach(function (b) { b.setAttribute('aria-disabled', 'true'); });
      btns[choice].classList.add('picked');
      var rightAt = choices.indexOf(right);
      if (!exam) {
        if (rightAt >= 0) btns[rightAt].classList.add('right');
        if (!ok) btns[choice].classList.add('wrong');
      }
      settle(ok, L(right));
    }

    function tapped(id) {
      var step = steps[si];
      if (done || !step || phase !== 'tap') return;
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
        else { host.highlight(id, 'bad'); host.highlight(right, 'ok', true); }
        settle(ok, L(right));
      }
    }
    host.onPick(tapped);

    function skip() {
      var step = steps[si];
      if (done || !step || phase !== 'tap') return;
      var right = OwnItCore.decode(step.answer); // skipping gives the answer up, so this is an answer too
      if (!exam) host.highlight(right, 'ok');
      settle(false, L(right));
    }
    skipBtn.addEventListener('click', skip);

    function next(at) {
      if (done || phase !== 'locked' || at !== si) return;
      if (si + 1 >= total) return finish();
      si++;
      render();
    }

    function finish() {
      done = true;
      kit.finish(shell, ctx, { game: 'screen-tour', mode: mode, got: got, of: total, xp: got * XP_RIGHT, missed: missed, review: review });
    }

    nextBtn.addEventListener('click', function () { next(si); });

    var offs = kit.choiceKeys(ctx, function (i) { choose(si, i); });
    offs.push(kit.onActivate(ctx, area, 'n', function () { next(si); }));
    [['ArrowRight', 1], ['ArrowDown', 1], ['ArrowLeft', -1], ['ArrowUp', -1]].forEach(function (p) {
      offs.push(ctx.keys.on(p[0], function (e) {
        if (phase !== 'tap' || kit.modalOpen() || !kit.mine(e, area)) return;
        if (e && e.preventDefault) e.preventDefault();
        host.move(p[1]);
      }));
    });
    offs.push(kit.onActivate(ctx, area, 'Enter', function (e) {
      if (phase === 'locked') return next(si);
      if (phase === 'tap') { host.pickCurrent(); return; }
      var at = kit.targetIndex(answersEl.querySelectorAll('.answer'), e);
      if (at >= 0) choose(si, at);
    }));

    if (total) render();
    else {
      done = true;
      shell.stopTimer();
      prompt.textContent = 'This round has no steps.';
      hint.textContent = 'Ask Claude to build a new screen tour round, then pick it again from the board.';
      [dots.el, skipBtn].forEach(function (n) { n.setAttribute('hidden', 'hidden'); });
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
