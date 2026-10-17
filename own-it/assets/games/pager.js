/* own-it game template: 3am Pager (design spec 5d, frontend spec 6.3). An alarm sounds, the field behind the board tints salmon, and a
   90 s clock runs. A failure is described and its log lines appear one by one in the log panel. The player picks the step that breaks
   first: 20 XP, minus 10 for each wrong pick (never below 0), plus up to 10 for the time left. The right step arrives obfuscated and is
   decoded only on a pick. Keys 1-4 pick. The last 5 s tick. The tint is cleared when the round ends or is left. Builds DOM with
   OwnIt.el only. */
(function () {
  'use strict';
  var OwnIt = window.OwnIt;
  var kit = OwnIt.kit;
  var XP_FOUND = 20, XP_WRONG = 10, XP_SPEED = 10, CLOCK_MS = 90000, STEP_MS = 100, LOG_MS = 1500, TICKS_FROM = 5;

  function play(root, round, ctx) {
    var cards = ((round && round.cards) || []).filter(function (c) { return c && typeof c.id === 'string'; });
    var logs = (round && round.logs) || [];
    var total = cards.length;
    var labels = round && round.labels;
    var exam = (round && round.mode === 'exam') || OwnIt.mode === 'exam';
    var mode = exam ? 'exam' : 'practice';
    var L = function (c) { return c.label || kit.label(c.id, labels); };

    var done = false;
    var found = false;
    var wrongPicks = 0;
    var tried = {};         // card position -> true
    var shownLogs = 0;
    var elapsed = 0;
    var secsShown = Math.ceil(CLOCK_MS / 1000);
    var clock = null;
    var culprit = null;       // decoded on the first pick or at the end

    var shell = OwnIt.shell(root, ctx, { zone: round && round.zone, total: 1, side: false });
    var area = shell.area;
    shell.startTimer();

    var panel = OwnIt.el('section', { 'class': 'panel pg-panel' });
    var goal = OwnIt.el('h2', { 'class': 'quiz-q' }, (round && round.failure) || '');
    var bar = OwnIt.el('div', { 'class': 'cr-fuse', role: 'progressbar', 'aria-label': 'Seconds left', 'aria-valuemin': '0', 'aria-valuemax': String(CLOCK_MS / 1000), 'aria-valuenow': String(secsShown) });
    var line = OwnIt.el('div', { 'class': 'cr-fuse-line' });
    bar.appendChild(line);
    var logEl = OwnIt.el('div', { 'class': 'pg-log', role: 'log', 'aria-label': 'Log lines', 'aria-live': 'polite' });
    var ask = OwnIt.el('p', { 'class': 'wb-intro' }, 'Which step breaks first? Tap it, or press 1 to ' + Math.max(1, total) + '.');
    var answersEl = OwnIt.el('div', { 'class': 'answers', role: 'group', 'aria-label': 'Steps' });
    var feedback = OwnIt.el('div', { 'class': 'quiz-feedback', 'aria-live': 'polite' });
    [goal, bar, logEl, ask, answersEl, feedback].forEach(function (n) { panel.appendChild(n); });
    area.appendChild(panel);

    function setAlert(on) { if (OwnIt.field && OwnIt.field.setAlert) OwnIt.field.setAlert(on); }

    function showLog() {
      if (shownLogs >= logs.length) return;
      logEl.appendChild(OwnIt.el('p', { 'class': 'pg-line' }, logs[shownLogs]));
      shownLogs++;
    }

    function paintClock() {
      var left = Math.max(0, CLOCK_MS - elapsed);
      line.style.width = Math.round(left / CLOCK_MS * 1000) / 10 + '%';
      var secs = Math.ceil(left / 1000);
      if (secs !== secsShown) {
        secsShown = secs;
        bar.setAttribute('aria-valuenow', String(secs));
        if (secs >= 1 && secs <= TICKS_FROM) OwnIt.sound('tick', secs);
      }
    }

    function stopClock() { if (clock) { clearInterval(clock); clock = null; } }

    function step() {
      if (done) return;
      elapsed += STEP_MS;
      if (elapsed % LOG_MS === 0) showLog();
      paintClock();
      if (elapsed >= CLOCK_MS) timeUp();
    }

    var btns = [];
    function pick(i) {
      if (done || found || i < 0 || i >= total || tried[i]) return;
      tried[i] = true;
      var ok = cards[i].id === culpritId(); // the answer is decoded only here and when the round ends
      if (ok) {
        found = true;
        btns[i].classList.add('right');
        OwnIt.sound('correct');
        OwnIt.juice.confetti(panel);
        return finish();
      }
      wrongPicks++;
      btns[i].classList.add('wrong');
      btns[i].setAttribute('aria-disabled', 'true');
      OwnIt.sound('wrong');
      OwnIt.juice.shake(panel);
      feedback.textContent = '';
      kit.note(feedback, 'bad', 'Not that one.', 'The log says otherwise. Read it again.');
    }

    function culpritId() {
      if (culprit === null) culprit = OwnItCore.decode(round.answer);
      return culprit;
    }

    function end(xp, got) {
      done = true;
      stopClock();
      setAlert(false);
      var c = cards.filter(function (x) { return x.id === culpritId(); })[0];
      var review = got && !wrongPicks ? [] : [{ text: 'The failure: ' + ((round && round.failure) || '') + ' It broke at ' + (c ? L(c) : 'a step you did not pick') + '.' }];
      kit.finish(shell, ctx, { game: 'pager', mode: mode, got: got, of: 1, xp: xp, missed: got && !wrongPicks ? [] : ['0'], review: review });
    }

    function finish() {
      var left = Math.max(0, CLOCK_MS - elapsed);
      end(Math.max(0, XP_FOUND - XP_WRONG * wrongPicks) + Math.round(XP_SPEED * left / CLOCK_MS), 1);
    }

    function timeUp() {
      if (done) return;
      OwnIt.sound('wrong');
      feedback.textContent = '';
      kit.note(feedback, 'bad', 'Time is up.', 'The pager went unanswered.');
      end(0, 0);
    }

    btns = kit.answerButtons(answersEl, cards.map(L), pick);

    var offs = [];
    ['1', '2', '3', '4'].forEach(function (k, i) {
      offs.push(ctx.keys.on(k, function () { if (!kit.modalOpen()) pick(i); }));
    });

    if (total) {
      OwnIt.sound('alarm');
      setAlert(true);
      showLog();
      paintClock();
      clock = setInterval(step, STEP_MS);
      if (btns[0] && btns[0].focus) btns[0].focus();
    } else {
      done = true;
      shell.stopTimer();
      goal.textContent = 'This round has no steps. Ask Claude to build a new pager round, then pick it again from the board.';
    }

    return function () {
      done = true;
      stopClock();
      setAlert(false);
      offs.forEach(function (off) { try { off(); } catch (e) { /* gone */ } });
      shell.destroy();
    };
  }

  OwnIt.register({
    id: 'pager',
    name: '3am Pager',
    minutes: 4,
    keys: [['1-4', 'Pick the step that breaks'], ['Esc', 'Leave']],
    play: play
  });
})();
