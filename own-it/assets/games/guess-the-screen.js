/* own-it game template: Guess the Screen (design spec 6.2, frontend spec 6.3). A rebuilt app screen starts blurred (16 px) and
   sharpens to 0 over 12 s. The player buzzes (Space or the big button) and then names it from 4 choices. A faster buzz scores more:
   points = max(1, round(10 * remaining / 12)), out of 10 per screen. Answers arrive obfuscated and are decoded only on answer. */
(function () {
  'use strict';
  var OwnIt = window.OwnIt;
  var SECONDS = 12;
  var MAX_BLUR = 16;
  var PER_SCREEN = 10;
  var LABEL = function (t) { return OwnIt.screenhost.label(t); };

  function guessPoints(remaining) {
    var r = Math.max(0, Math.min(SECONDS, Number(remaining) || 0));
    return Math.max(1, Math.round(PER_SCREEN * r / SECONDS));
  }
  OwnIt.guessPoints = guessPoints;

  function now() {
    return window.performance && window.performance.now ? window.performance.now() : Date.now();
  }

  function play(root, round, ctx) {
    var screens = (round && round.screens) || [];
    var total = screens.length;
    var of = PER_SCREEN * total;
    var exam = (round && round.mode === 'exam') || OwnIt.mode === 'exam';
    var mode = exam ? 'exam' : 'practice';

    var si = 0;
    var phase = 'blur';    // blur (sharpening, waiting for a buzz), choose, locked
    var done = false;
    var points = 0;
    var missed = [];
    var review = [];
    var startedAt = 0;
    var remainingAtBuzz = 0;
    var host = null;
    var tick = null;

    var shell = OwnIt.shell(root, ctx, { zone: round && round.zone, total: of, side: false });
    shell.setScore(0, of);
    shell.startTimer();

    var card = OwnIt.el('section', { 'class': 'panel guess-card' });
    var dots = OwnIt.el('div', { 'class': 'qdots', role: 'img' });
    var dotEls = [];
    for (var d = 0; d < total; d++) {
      var dot = OwnIt.el('span', { 'class': 'qdot' });
      dotEls.push(dot);
      dots.appendChild(dot);
    }
    var title = OwnIt.el('h2', { 'class': 'quiz-q', 'aria-live': 'polite' });
    var stage = OwnIt.el('div', { 'class': 'guess-screen' });
    var meter = OwnIt.el('div', { 'class': 'guess-meter', 'aria-hidden': 'true' });
    var meterFill = OwnIt.el('span', { 'class': 'guess-meter-fill' });
    meter.appendChild(meterFill);
    var buzz = OwnIt.button('Buzz', 'primary', null, { 'class': 'btn btn-primary buzz-btn' });
    buzz.appendChild(OwnIt.el('span', { 'class': 'buzz-key', 'aria-hidden': 'true' }, ' Space'));
    var choicesEl = OwnIt.el('div', { 'class': 'answers guess-choices', role: 'group', 'aria-label': 'Which screen is this?', 'aria-live': 'polite' });
    var feedback = OwnIt.el('div', { 'class': 'quiz-feedback', 'aria-live': 'polite' });
    var actions = OwnIt.el('div', { 'class': 'actions quiz-actions' });
    var nextBtn = OwnIt.button('Next', 'primary', null, { 'class': 'btn btn-primary guess-next' });
    nextBtn.setAttribute('hidden', 'hidden');
    actions.appendChild(nextBtn);
    [dots, title, stage, meter, buzz, choicesEl, feedback, actions].forEach(function (n) { card.appendChild(n); });
    shell.area.appendChild(card);

    function stopTick() { if (tick) { clearInterval(tick); tick = null; } }

    function remaining() {
      return Math.max(0, Math.min(SECONDS, SECONDS - (now() - startedAt) / 1000));
    }

    function paint(rem) {
      var px = Math.round(MAX_BLUR * rem / SECONDS * 10) / 10;
      stage.style.filter = 'blur(' + px + 'px)';
      meterFill.style.width = Math.round(100 * rem / SECONDS) + '%';
    }

    function setDots() {
      dotEls.forEach(function (el, i) {
        var state = el.getAttribute('data-state');
        el.className = 'qdot' + (i === si && phase !== 'locked' ? ' now' : '') + (state ? ' ' + state : '');
      });
      dots.setAttribute('aria-label', 'Screen ' + Math.min(si + 1, total) + ' of ' + total);
    }

    function render() {
      stopTick();
      if (host) host.destroy();
      stage.textContent = '';
      host = OwnIt.screenhost.mount(stage, screens[si].screen, { height: 640, maxScale: 1.3, blockPointer: true });
      phase = 'blur';
      title.textContent = 'Screen ' + (si + 1) + ' of ' + total + ': what is this screen?';
      choicesEl.textContent = '';
      choicesEl.setAttribute('hidden', 'hidden');
      feedback.textContent = '';
      nextBtn.setAttribute('hidden', 'hidden');
      buzz.removeAttribute('hidden');
      startedAt = now();
      paint(SECONDS);
      var every = OwnIt.reduced() ? 1000 : 250;
      tick = setInterval(function () {
        if (phase !== 'blur') return;
        var rem = remaining();
        paint(rem);
        if (rem <= 0) reveal(0); // out of time: the choices open on their own
      }, every);
      setDots();
    }

    function reveal(rem) {
      stopTick();
      remainingAtBuzz = rem;
      phase = 'choose';
      buzz.setAttribute('hidden', 'hidden');
      var mine = si;
      screens[si].choices.slice(0, 4).forEach(function (c, i) {
        var b = OwnIt.el('button', { type: 'button', 'class': 'answer' });
        b.appendChild(OwnIt.el('span', { 'class': 'answer-key', 'aria-hidden': 'true' }, String(i + 1)));
        b.appendChild(OwnIt.el('span', { 'class': 'answer-text' }, LABEL(c)));
        b.addEventListener('click', function () { choose(mine, i); });
        choicesEl.appendChild(b);
      });
      choicesEl.removeAttribute('hidden');
      OwnIt.sound('hint');
      setDots();
    }

    function doBuzz() {
      if (done || phase !== 'blur') return;
      var rem = remaining();
      paint(rem);
      reveal(rem);
    }

    function note(cls, label, text) {
      var line = OwnIt.el('p', { 'class': 'quiz-why ' + cls });
      line.appendChild(OwnIt.el('strong', null, label + ' '));
      line.appendChild(OwnIt.el('span', null, text));
      feedback.appendChild(line);
    }

    function choose(at, choice) {
      if (done || phase !== 'choose' || at !== si) return;
      var entry = screens[si];
      var choices = entry.choices.slice(0, 4);
      if (choice < 0 || choice >= choices.length) return;
      var right = OwnItCore.decode(entry.answer); // the only place an answer is decoded
      var ok = choices[choice] === right;
      phase = 'locked';
      var btns = choicesEl.querySelectorAll('.answer');
      btns.forEach(function (b) { b.setAttribute('aria-disabled', 'true'); });
      btns[choice].classList.add('picked');
      var earned = ok ? guessPoints(remainingAtBuzz) : 0;
      points += earned;
      if (!ok) { missed.push(String(si)); review.push({ text: 'Screen ' + (si + 1) + ': it was ' + LABEL(right) + '.' }); }
      dotEls[si].setAttribute('data-state', exam ? 'set' : ok ? 'ok' : 'bad');
      stage.style.filter = 'blur(0px)'; // the picture clears for the answer
      meterFill.style.width = '0%';
      if (exam) {
        note('locked', 'Locked in.', 'Answers show at the end.');
      } else {
        var rightAt = choices.indexOf(right);
        if (rightAt >= 0) btns[rightAt].classList.add('right');
        if (ok) {
          OwnIt.sound('correct');
          OwnIt.juice.confetti(card);
          feedback.appendChild(OwnIt.el('p', { 'class': 'quiz-xp' }, '+' + earned + ' points'));
          note('good', 'Right.', LABEL(right));
        } else {
          btns[choice].classList.add('wrong');
          OwnIt.sound('wrong');
          OwnIt.juice.shake(card);
          note('bad', 'Not quite.', 'It was: ' + LABEL(right));
        }
      }
      shell.setScore(points, of);
      nextBtn.textContent = si + 1 >= total ? 'See result' : 'Next';
      nextBtn.removeAttribute('hidden');
      nextBtn.focus();
      setDots();
    }

    function next(at) {
      if (done || phase !== 'locked' || at !== si) return;
      if (si + 1 >= total) return finish();
      si++;
      render();
    }

    function finish() {
      done = true;
      stopTick();
      shell.stopTimer();
      shell.setScore(points, of);
      var xp = Math.max(0, points - shell.hintsUsed() * 15);
      shell.result({
        got: points, total: of, xp: xp, missed: review,
        payload: { id: ctx.roundId, game: 'guess-the-screen', mode: mode, submittedAt: new Date().toISOString(), got: points, of: of, missed: missed }
      });
    }

    buzz.addEventListener('click', doBuzz);
    nextBtn.addEventListener('click', function () { next(si); });

    var offs = [];
    function onKey(fn) { return function (e) { if (!document.body.querySelector('.scrim')) fn(e); }; }
    offs.push(ctx.keys.on(' ', onKey(function (e) {
      if (e && e.preventDefault) e.preventDefault(); // the page must not scroll, and a focused button must not also click
      doBuzz();
    })));
    [['1', 0], ['2', 1], ['3', 2], ['4', 3], ['a', 0], ['b', 1], ['c', 2], ['d', 3]].forEach(function (p) {
      offs.push(ctx.keys.on(p[0], onKey(function () { choose(si, p[1]); })));
    });
    offs.push(ctx.keys.on('n', onKey(function () { next(si); })));
    offs.push(ctx.keys.on('Enter', onKey(function (e) {
      if (e && e.preventDefault) e.preventDefault();
      if (phase === 'locked') return next(si);
      if (phase === 'blur') { if (e && e.target === buzz) doBuzz(); return; }
      var btns = choicesEl.querySelectorAll('.answer');
      for (var i = 0; i < btns.length; i++) if (btns[i] === (e && e.target)) return choose(si, i);
    })));

    if (total) render();
    else {
      done = true;
      shell.stopTimer();
      title.textContent = 'This round has no screens.';
      card.appendChild(OwnIt.el('p', { 'class': 'quiz-why' }, 'Ask Claude to build a new Guess the Screen round, then pick it again from the board.'));
      [dots, meter, buzz, choicesEl].forEach(function (n) { n.setAttribute('hidden', 'hidden'); });
    }

    return function () {
      done = true;
      stopTick();
      offs.forEach(function (off) { try { off(); } catch (e) { /* gone */ } });
      if (host) host.destroy();
      shell.destroy();
    };
  }

  OwnIt.register({
    id: 'guess-the-screen',
    name: 'Guess the Screen',
    minutes: 2,
    keys: [['Space', 'Buzz'], ['1-4', 'Answer'], ['A-D', 'Answer'], ['Enter', 'Next screen'], ['N', 'Next screen'], ['Esc', 'Leave']],
    play: play
  });
})();
