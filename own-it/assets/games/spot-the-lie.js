/* own-it game template: Spot the Lie (design spec 5d, frontend spec 6.3). Five statements about one zone, one of them false. The player
   picks the false one: 10 XP when it is the first pick, nothing after a miss, but the lie must still be found. Every pick shows
   its reason after it is made. In exam mode the first pick is final and reasons wait for the result. The index of the lie arrives
   obfuscated and is decoded only when the player picks. Builds DOM with OwnIt.el only. */
(function () {
  'use strict';
  var OwnIt = window.OwnIt;
  var kit = OwnIt.kit;
  var XP_FIRST = 10;

  function play(root, round, ctx) {
    var statements = (round && round.statements) || [];
    var total = statements.length;
    var exam = (round && round.mode === 'exam') || OwnIt.mode === 'exam';
    var mode = exam ? 'exam' : 'practice';

    var done = false;
    var found = false;       // the lie has been found (or, in exam, the one pick was made)
    var tries = 0;           // wrong picks before the lie
    var tried = {};          // index -> true
    var lieAt = -1;

    var shell = OwnIt.shell(root, ctx, { zone: round && round.zone, total: 1, side: false });
    var area = shell.area;
    shell.startTimer();

    var card = OwnIt.el('section', { 'class': 'panel quiz-card' });
    var q = OwnIt.el('h2', { 'class': 'quiz-q', 'aria-live': 'polite' }, 'One of these statements is false. Which one?');
    var answersEl = OwnIt.el('div', { 'class': 'answers lie-list', role: 'group', 'aria-label': 'Statements' });
    var feedback = OwnIt.el('div', { 'class': 'quiz-feedback', 'aria-live': 'polite' });
    var actions = OwnIt.el('div', { 'class': 'actions quiz-actions' });
    var nextBtn = OwnIt.button('See result', 'primary', null);
    nextBtn.setAttribute('hidden', 'hidden');
    actions.appendChild(nextBtn);
    [q, answersEl, feedback, actions].forEach(function (n) { card.appendChild(n); });
    area.appendChild(card);

    var btns = [];
    function pickAt(e) { return kit.targetIndex(btns, e); }

    function pick(i) {
      if (done || found || i < 0 || i >= total || tried[i]) return;
      lieAt = OwnItCore.decode(round.answer); // the only place the answer is decoded
      var ok = i === lieAt;
      tried[i] = true;
      btns.forEach(function (b) { b.setAttribute('aria-disabled', 'true'); });
      btns[i].classList.add('picked');
      if (exam) {
        found = true;
        if (!ok) tries++;
        kit.note(feedback, 'locked', 'Locked in.', 'The answer and the reasons show at the end.');
        return reveal();
      }
      if (ok) {
        found = true;
        btns[i].classList.add('right');
        OwnIt.sound('correct');
        OwnIt.juice.confetti(card);
        shell.setScore(tries === 0 ? 1 : 0, 1);
        if (tries === 0) feedback.appendChild(OwnIt.el('p', { 'class': 'quiz-xp' }, '+' + XP_FIRST + ' XP'));
        kit.note(feedback, 'good', 'That is the false one.', statements[i].why);
        reveal();
      } else {
        tries++;
        btns[i].classList.add('wrong');
        OwnIt.sound('wrong');
        OwnIt.juice.shake(card);
        kit.note(feedback, 'bad', 'Not the lie.', statements[i].why);
        btns.forEach(function (b, k) { if (!tried[k]) b.removeAttribute('aria-disabled'); });
      }
    }

    function reveal() {
      kit.nextLabel(nextBtn, 0, 1);
    }

    function finish() {
      if (done || !found) return;
      done = true;
      var first = tries === 0;
      var review = first ? [] : [{ text: 'The false statement was: ' + statements[lieAt].text + ' ' + statements[lieAt].why }];
      kit.finish(shell, ctx, { game: 'spot-the-lie', mode: mode, got: first ? 1 : 0, of: 1, xp: first ? XP_FIRST : 0, missed: first ? [] : ['0'], review: review });
    }

    nextBtn.addEventListener('click', finish);

    var offs = [];
    ['1', '2', '3', '4', '5'].forEach(function (k, i) {
      offs.push(ctx.keys.on(k, function () { if (!kit.modalOpen()) pick(i); }));
    });
    offs.push(kit.onActivate(ctx, area, 'n', finish));
    offs.push(kit.onActivate(ctx, area, 'Enter', function (e) {
      if (found) return finish();
      var at = pickAt(e);
      if (at >= 0) pick(at);
    }));

    if (total) {
      btns = kit.answerButtons(answersEl, statements.map(function (s) { return s.text; }), pick);
    } else {
      done = true;
      shell.stopTimer();
      q.textContent = 'This round has no statements.';
      card.appendChild(OwnIt.el('p', { 'class': 'quiz-why' }, 'Ask Claude to build a new spot the lie round, then pick it again from the board.'));
    }

    return function () {
      done = true;
      offs.forEach(function (off) { try { off(); } catch (e) { /* gone */ } });
      shell.destroy();
    };
  }

  OwnIt.register({
    id: 'spot-the-lie',
    name: 'Spot the Lie',
    minutes: 4,
    keys: [['1-5', 'Pick a statement'], ['Enter', 'Pick the focused one, then see result'], ['N', 'See result'], ['Esc', 'Leave']],
    play: play
  });
})();
