/* own-it game template: Design Duel (design spec 5e). Three decisions. Each shows two designs side by side (stacked on a phone): the one
   that was really built and the road not taken, on random sides. The player picks the one that is theirs (5 XP), then the real reason it
   won out of four (5 XP). The reveal marks the real design and the real reason. A decision counts as won when both are right. The side
   and the reason arrive obfuscated and are decoded only when a pick is made. Keys A and B (or 1 and 2) pick a design, 1 to 4 or A to D a
   reason, Enter moves on. Builds DOM with OwnIt.el only. */
(function () {
  'use strict';
  var OwnIt = window.OwnIt;
  var kit = OwnIt.kit;
  var XP_PICK = 5, XP_REASON = 5, SIDE_NAMES = ['A', 'B'];

  function play(root, round, ctx) {
    var decisions = (round && round.decisions) || [];
    var validDecision = function (d) {
      return d && typeof d.a === 'string' && typeof d.b === 'string' && typeof d.answer === 'string' &&
        Array.isArray(d.reasons) && d.reasons.length === 4 && d.reasons.every(function (r) { return typeof r === 'string'; });
    };
    if (!Array.isArray(decisions) || !decisions.length || !decisions.every(validDecision)) throw new Error('This round cannot be played: malformed design duel round.');
    var total = decisions.length;
    var exam = (round && round.mode === 'exam') || OwnIt.mode === 'exam';
    var mode = exam ? 'exam' : 'practice';

    var done = false;
    var at = 0;
    var phase = 'side';     // side | reason | shown
    var truth = null;       // kit.lazy of the current decision's answer
    var sideRight = false;
    var won = 0, xp = 0, streak = 0;
    var missed = [];
    var review = [];

    var shell = OwnIt.shell(root, ctx, { zone: round && round.zone, total: total, side: false });
    var area = shell.area;
    shell.setScore(0, total);
    shell.startTimer();

    var panel = OwnIt.el('section', { 'class': 'panel dl-panel' });
    var meter = OwnIt.el('p', { 'class': 'wa-meter', 'aria-live': 'polite' });
    var question = OwnIt.el('h2', { 'class': 'quiz-q', 'aria-live': 'polite' });
    var sidesEl = OwnIt.el('div', { 'class': 'dl-sides', role: 'group', 'aria-label': 'The two designs' });
    var reasonsEl = OwnIt.el('div', { 'class': 'answers', role: 'group', 'aria-label': 'Reasons' });
    var feedback = OwnIt.el('div', { 'class': 'quiz-feedback', 'aria-live': 'polite' });
    var actions = OwnIt.el('div', { 'class': 'actions quiz-actions' });
    var nextBtn = OwnIt.button('Next', 'primary', null);
    nextBtn.classList.add('dl-next');
    nextBtn.setAttribute('hidden', 'hidden');
    actions.appendChild(nextBtn);
    panel.appendChild(OwnIt.el('p', { 'class': 'wb-intro' }, 'Two designs, one was built. Pick yours with A or B, or tap. Then pick the real reason with 1 to 4. Enter moves on.'));
    [meter, question, sidesEl, reasonsEl, feedback, actions].forEach(function (x) { panel.appendChild(x); });
    area.appendChild(panel);

    var sideBtns = [], reasonBtns = [];

    function show() {
      var d = decisions[at];
      phase = 'side';
      truth = kit.lazy(d.answer);
      meter.textContent = 'Decision ' + (at + 1) + ' of ' + total + '. ' + won + ' won so far.';
      question.textContent = 'Which design would you ship?';
      feedback.textContent = '';
      reasonsEl.textContent = '';
      reasonsEl.setAttribute('hidden', 'hidden');
      reasonBtns = [];
      sidesEl.textContent = '';
      sideBtns = [d.a, d.b].map(function (text, i) {
        var b = OwnIt.el('button', { type: 'button', 'class': 'dl-side' });
        b.appendChild(OwnIt.el('span', { 'class': 'answer-key', 'aria-hidden': 'true' }, SIDE_NAMES[i]));
        b.appendChild(OwnIt.el('span', { 'class': 'answer-text' }, text));
        b.addEventListener('click', function () { pickSide(i); });
        sidesEl.appendChild(b);
        return b;
      });
      nextBtn.setAttribute('hidden', 'hidden');
      if (sideBtns[0].focus) sideBtns[0].focus();
    }

    function pickSide(i) {
      if (done || phase !== 'side' || i < 0 || i > 1) return;
      sideRight = truth().side === i; // the answer is decoded on the first pick
      phase = 'reason';
      sideBtns[i].classList.add('picked');
      sideBtns.forEach(function (b) { b.setAttribute('aria-disabled', 'true'); });
      OwnIt.sound('press');
      question.textContent = 'Why did it win?';
      reasonsEl.removeAttribute('hidden');
      reasonBtns = kit.answerButtons(reasonsEl, decisions[at].reasons, pickReason);
      reasonBtns.forEach(function (b) { b.classList.add('dl-reason'); });
      if (reasonBtns[0].focus) reasonBtns[0].focus();
    }

    function pickReason(j) {
      if (done || phase !== 'reason' || j < 0 || j >= reasonBtns.length) return;
      phase = 'shown';
      var d = decisions[at];
      var a = truth();
      var reasonRight = a.reason === j;
      var real = a.side === 0 ? d.a : d.b, alt = a.side === 0 ? d.b : d.a;
      xp += (sideRight ? XP_PICK : 0) + (reasonRight ? XP_REASON : 0);
      sideBtns[a.side].classList.add('real');
      if (!sideRight) sideBtns[1 - a.side].classList.add('wrong');
      reasonBtns.forEach(function (b) { b.setAttribute('aria-disabled', 'true'); });
      if (reasonBtns[a.reason]) reasonBtns[a.reason].classList.add('right');
      if (!reasonRight && reasonBtns[j]) reasonBtns[j].classList.add('wrong');
      var line = 'You shipped ' + real + ' instead of ' + alt + '. ' + d.reasons[a.reason];
      feedback.textContent = '';
      if (sideRight && reasonRight) {
        won++;
        streak++;
        OwnIt.sound('combo', streak);
        shell.setScore(won, total);
        feedback.appendChild(OwnIt.el('p', { 'class': 'quiz-xp' }, '+' + (XP_PICK + XP_REASON) + ' XP'));
        kit.note(feedback, 'good', 'Right.', line);
      } else {
        if (streak > 1) OwnIt.sound('streak-break');
        streak = 0;
        missed.push(String(at));
        review.push({ text: 'The real design: ' + real + ', not ' + alt + '. The real reason: ' + d.reasons[a.reason] });
        OwnIt.sound('wrong');
        OwnIt.juice.shake(panel);
        feedback.appendChild(OwnIt.el('p', { 'class': 'quiz-xp' }, '+' + ((sideRight ? XP_PICK : 0) + (reasonRight ? XP_REASON : 0)) + ' XP'));
        kit.note(feedback, 'bad', sideRight ? 'Right design, wrong reason.' : reasonRight ? 'Wrong design, right reason.' : 'Not quite.', line);
      }
      kit.nextLabel(nextBtn, at, total);
    }

    function choose(i) {
      if (done) return;
      if (phase === 'side') pickSide(i); else if (phase === 'reason') pickReason(i);
    }

    function next() {
      if (done || phase !== 'shown') return;
      at++;
      if (at >= total) return finish();
      show();
    }

    function finish() {
      if (done) return;
      done = true;
      if (won >= total) { OwnIt.sound('correct'); OwnIt.juice.confetti(panel); }
      kit.finish(shell, ctx, { game: 'design-duel', mode: mode, got: won, of: total, xp: xp, missed: missed, review: review });
    }

    nextBtn.addEventListener('click', next);

    var offs = kit.choiceKeys(ctx, choose);
    offs.push(kit.onActivate(ctx, area, 'Enter', next));

    show();

    return function () {
      done = true;
      kit.release(offs);
      shell.destroy();
    };
  }

  OwnIt.register({
    id: 'design-duel',
    name: 'Design Duel',
    minutes: 3,
    keys: [['A, B', 'Pick the design you shipped'], ['1-4 or A-D', 'Pick the real reason'], ['Enter', 'Move on'], ['Esc', 'Leave']],
    play: play
  });
})();
