/* own-it game template: Quiz (design spec 6.1, frontend spec 6.3). Five questions, four options each.
   Correct indices arrive obfuscated and are decoded only when the player answers. Builds DOM with OwnIt.el only. */
(function () {
  'use strict';
  var OwnIt = window.OwnIt;
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
    var dots = OwnIt.kit.dots(total);
    var qText = OwnIt.el('h2', { 'class': 'quiz-q', 'aria-live': 'polite' });
    var answersEl = OwnIt.el('div', { 'class': 'answers', role: 'group', 'aria-label': 'Answers' });
    var feedback = OwnIt.el('div', { 'class': 'quiz-feedback', 'aria-live': 'polite' });
    var actions = OwnIt.el('div', { 'class': 'actions quiz-actions' });
    var nextBtn = OwnIt.button('Next', 'primary', null);
    nextBtn.setAttribute('hidden', 'hidden');
    actions.appendChild(nextBtn);
    card.appendChild(dots.el);
    card.appendChild(qText);
    card.appendChild(answersEl);
    card.appendChild(feedback);
    card.appendChild(actions);
    area.appendChild(card);

    function clearAuto() { if (auto) { clearTimeout(auto); auto = null; } }

    function setDots() { dots.paint(qi, locked, 'Question'); }

    function render() {
      clearAuto();
      locked = false;
      var q = questions[qi];
      current = q;
      qText.textContent = q.q;
      feedback.textContent = '';
      nextBtn.setAttribute('hidden', 'hidden');
      var at = qi;
      OwnIt.kit.answerButtons(answersEl, q.options.map(function (o) { return o.text; }), function (i) { pick(at, i); });
      setDots();
    }

    var note = function (parent, cls, label, text) { OwnIt.kit.note(parent, cls, label, text); };

    function pick(at, choice) {
      if (done || locked || at !== qi) return;
      var q = questions[qi];
      if (choice < 0 || choice >= q.options.length) return;
      locked = true;
      var right = OwnItCore.decode(q.answer); // the only place an answer is decoded
      var seen = {};
      var why = function (i) { if (!(i in seen)) seen[i] = OwnItCore.decode(q.options[i].why); return seen[i]; }; // reasons are decoded only when shown, once each
      var ok = choice === right;
      var btns = Array.from(answersEl.querySelectorAll('.answer'));
      btns.forEach(function (b) { b.setAttribute('aria-disabled', 'true'); });
      btns[choice].classList.add('picked');
      if (ok) got++; else missed.push(String(qi));
      if (!ok) review.push({ text: 'Question ' + (qi + 1) + ': ' + q.q + ' Answer: ' + q.options[right].text + '. ' + why(right) });
      dots.set(qi, exam ? 'set' : ok ? 'ok' : 'bad');

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
          note(feedback, 'good', 'Why:', why(right));
        } else {
          btns[choice].classList.add('wrong');
          OwnIt.sound('wrong');
          OwnIt.juice.shake(card);
          note(feedback, 'bad', 'Why not:', why(choice));
          note(feedback, 'good', 'Why this one:', why(right));
        }
      }
      OwnIt.kit.nextLabel(nextBtn, qi, total);
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
      OwnIt.kit.finish(shell, ctx, { game: 'quiz', mode: mode, got: got, of: total, xp: got * XP_RIGHT, missed: missed, review: review });
    }

    nextBtn.addEventListener('click', function () { next(qi); });

    var offs = OwnIt.kit.choiceKeys(ctx, function (i) { pick(qi, i); });
    offs.push(OwnIt.kit.onActivate(ctx, area, 'n', function () { next(qi); }));
    offs.push(OwnIt.kit.onActivate(ctx, area, 'Enter', function (e) {
      if (!locked) {
        var at = OwnIt.kit.targetIndex(answersEl.querySelectorAll('.answer'), e);
        if (at >= 0) pick(qi, at); // Enter on a focused answer picks it
        return;
      }
      next(qi);
    }));

    if (total) render();
    else {
      done = true;
      shell.stopTimer();
      qText.textContent = 'This round has no questions.';
      card.appendChild(OwnIt.el('p', { 'class': 'quiz-why' }, 'Ask Claude to build a new quiz round, then pick it again from the board.'));
      answersEl.setAttribute('hidden', 'hidden');
      dots.el.setAttribute('hidden', 'hidden');
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
