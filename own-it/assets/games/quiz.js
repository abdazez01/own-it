/* own-it game template: Quiz (design spec 6.1, frontend spec 6.3). Five questions, four options each.
   Correct indices arrive obfuscated and are decoded only when the player answers. Builds DOM with OwnIt.el only. */
(function () {
  'use strict';
  var OwnIt = window.OwnIt;
  var LETTERS = ['A', 'B', 'C', 'D'];
  var XP_RIGHT = 10;
  var AUTO_MS = 2600;
  var FALLBACK_HINT = 'Think about what the product does for the person using it, not how it is built.';

  function play(root, round, ctx) {
    var questions = (round && round.questions) || [];
    var total = questions.length;
    var exam = (round && round.mode === 'exam') || OwnIt.mode === 'exam';
    var mode = exam ? 'exam' : 'practice';

    var qi = 0;            // current question index
    var locked = false;    // current question answered
    var done = false;
    var got = 0;
    var missed = [];       // question indexes as strings
    var review = [];       // {text} rows for the result card
    var auto = null;
    var current = null;    // {peek}

    var shell = OwnIt.shell(root, ctx, {
      zone: round && round.zone,
      total: total,
      side: false,
      hint: exam ? null : function () { return (current && current.peek) || FALLBACK_HINT; }
    });
    var area = shell.area;
    shell.startTimer();

    var card = OwnIt.el('section', { 'class': 'panel quiz-card' });
    var dots = OwnIt.el('div', { 'class': 'qdots', role: 'img' });
    var dotEls = [];
    for (var d = 0; d < total; d++) {
      var dot = OwnIt.el('span', { 'class': 'qdot' });
      dotEls.push(dot);
      dots.appendChild(dot);
    }
    var qText = OwnIt.el('h2', { 'class': 'quiz-q', 'aria-live': 'polite' });
    var answersEl = OwnIt.el('div', { 'class': 'answers', role: 'group', 'aria-label': 'Answers' });
    var feedback = OwnIt.el('div', { 'class': 'quiz-feedback', 'aria-live': 'polite' });
    var actions = OwnIt.el('div', { 'class': 'actions quiz-actions' });
    var nextBtn = OwnIt.button('Next', 'primary', null);
    nextBtn.setAttribute('hidden', 'hidden');
    actions.appendChild(nextBtn);
    card.appendChild(dots);
    card.appendChild(qText);
    card.appendChild(answersEl);
    card.appendChild(feedback);
    card.appendChild(actions);
    area.appendChild(card);

    function clearAuto() { if (auto) { clearTimeout(auto); auto = null; } }

    function setDots() {
      dotEls.forEach(function (el, i) {
        var state = el.getAttribute('data-state');
        el.className = 'qdot' + (i === qi && !locked ? ' now' : '') + (state ? ' ' + state : '');
      });
      dots.setAttribute('aria-label', 'Question ' + Math.min(qi + 1, total) + ' of ' + total);
    }

    function render() {
      clearAuto();
      locked = false;
      var q = questions[qi];
      current = q;
      qText.textContent = q.q;
      answersEl.textContent = '';
      feedback.textContent = '';
      nextBtn.setAttribute('hidden', 'hidden');
      var mine = qi;
      q.options.forEach(function (o, i) {
        var b = OwnIt.el('button', { type: 'button', 'class': 'answer' });
        b.appendChild(OwnIt.el('span', { 'class': 'answer-key', 'aria-hidden': 'true' }, String(i + 1)));
        b.appendChild(OwnIt.el('span', { 'class': 'answer-text' }, o.text));
        b.addEventListener('click', function () { pick(mine, i); });
        answersEl.appendChild(b);
      });
      setDots();
    }

    function note(parent, cls, label, text) {
      var line = OwnIt.el('p', { 'class': 'quiz-why ' + cls });
      line.appendChild(OwnIt.el('strong', null, label + ' '));
      line.appendChild(OwnIt.el('span', null, text));
      parent.appendChild(line);
    }

    function pick(at, choice) {
      if (done || locked || at !== qi) return;
      var q = questions[qi];
      if (choice < 0 || choice >= q.options.length) return;
      locked = true;
      var right = OwnItCore.decode(q.answer); // the only place an answer is decoded
      var ok = choice === right;
      var btns = answersEl.querySelectorAll('.answer');
      btns.forEach(function (b) { b.setAttribute('aria-disabled', 'true'); });
      btns[choice].classList.add('picked');
      if (ok) got++; else missed.push(String(qi));
      if (!ok) review.push({ text: 'Question ' + (qi + 1) + ': ' + q.q + ' Answer: ' + q.options[right].text + '. ' + q.options[right].why });
      dotEls[qi].setAttribute('data-state', exam ? 'set' : ok ? 'ok' : 'bad');

      if (exam) {
        note(feedback, 'locked', 'Locked in.', 'Answers and reasons show at the end.');
      } else {
        btns[right].classList.add('right');
        if (ok) {
          btns[choice].classList.add('right');
          OwnIt.sound('correct');
          OwnIt.juice.confetti(card);
          shell.setScore(got, total);
          feedback.appendChild(OwnIt.el('p', { 'class': 'quiz-xp' }, '+' + XP_RIGHT + ' XP'));
          note(feedback, 'good', 'Why:', q.options[right].why);
        } else {
          btns[choice].classList.add('wrong');
          OwnIt.sound('wrong');
          OwnIt.juice.shake(card);
          note(feedback, 'bad', 'Why not:', q.options[choice].why);
          note(feedback, 'good', 'Why this one:', q.options[right].why);
        }
      }
      nextBtn.textContent = qi + 1 >= total ? 'See result' : 'Next';
      nextBtn.removeAttribute('hidden');
      nextBtn.focus();
      setDots();
      if (ok && !exam && qi + 1 < total) auto = setTimeout(function () { next(at); }, AUTO_MS);
    }

    function next(at) {
      if (done || !locked || at !== qi) return;
      clearAuto();
      if (qi + 1 >= total) return finish();
      qi++;
      render();
    }

    function finish() {
      done = true;
      shell.stopTimer();
      shell.setScore(got, total);
      var xp = Math.max(0, got * XP_RIGHT - shell.hintsUsed() * 15);
      shell.result({
        got: got, total: total, xp: xp, missed: review,
        payload: { id: ctx.roundId, game: 'quiz', mode: mode, submittedAt: new Date().toISOString(), got: got, of: total, missed: missed }
      });
    }

    nextBtn.addEventListener('click', function () { next(qi); });

    var offs = [];
    function onKey(fn) { return function (e) { if (!document.body.querySelector('.scrim')) fn(e); }; }
    [['1', 0], ['2', 1], ['3', 2], ['4', 3], ['a', 0], ['b', 1], ['c', 2], ['d', 3]].forEach(function (p) {
      offs.push(ctx.keys.on(p[0], onKey(function () { pick(qi, p[1]); })));
    });
    offs.push(ctx.keys.on('n', onKey(function () { next(qi); })));
    offs.push(ctx.keys.on('Enter', onKey(function (e) {
      if (e && e.preventDefault) e.preventDefault(); // stops the focused button's own click from firing a second time
      if (!locked) {
        var btns = answersEl.querySelectorAll('.answer'), at = btns.indexOf(e && e.target);
        if (at >= 0) pick(qi, at); // Enter on a focused answer picks it
        return;
      }
      next(qi);
    })));

    if (total) render();
    else {
      done = true;
      shell.stopTimer();
      qText.textContent = 'This round has no questions.';
      card.appendChild(OwnIt.el('p', { 'class': 'quiz-why' }, 'Ask Claude to build a new quiz round, then pick it again from the board.'));
      answersEl.setAttribute('hidden', 'hidden');
      dots.setAttribute('hidden', 'hidden');
    }

    return function () {
      done = true;
      clearAuto();
      offs.forEach(function (off) { try { off(); } catch (e) { /* gone */ } });
      shell.destroy();
    };
  }

  OwnIt.register({
    id: 'quiz',
    name: 'Quiz',
    minutes: 3,
    keys: [['1-4', 'Answer'], ['A-D', 'Answer'], ['Enter', 'Next question'], ['N', 'Next question'], ['H', 'Hint (costs 15 XP)'], ['Esc', 'Leave']],
    play: play
  });
})();
