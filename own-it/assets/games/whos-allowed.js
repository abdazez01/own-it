/* own-it game template: Who's Allowed? (design spec 5d, frontend spec 6.3). One card at a time: an action and the role that tries it.
   The player says Allow or Deny with the buttons, the left and right arrow keys, or a swipe. A right call scores 10 x (1 + streak / 5),
   where streak counts the right calls in a row before this one, and the combo sound climbs with the streak. A miss breaks the streak.
   Each card's reason shows right after it is judged. The clock runs 60 s. Every card's verdict arrives obfuscated and is decoded only
   when that card is judged. Builds DOM with OwnIt.el only. */
(function () {
  'use strict';
  var OwnIt = window.OwnIt;
  var kit = OwnIt.kit;
  var XP_BASE = 10, CLOCK_MS = 60000, STEP_MS = 100, TICKS_FROM = 5, SWIPE_PX = 50;

  function play(root, round, ctx) {
    var cards = ((round && round.cards) || []).filter(function (c) { return c && typeof c.action === 'string'; });
    var total = cards.length;
    var exam = (round && round.mode === 'exam') || OwnIt.mode === 'exam';
    var mode = exam ? 'exam' : 'practice';

    var done = false;
    var at = 0;             // card being judged
    var right = 0;
    var streak = 0;
    var xp = 0;
    var wrong = [];         // card positions judged wrong
    var review = [];
    var elapsed = 0;
    var secsShown = Math.ceil(CLOCK_MS / 1000);
    var clock = null;
    var touchX = null;

    var shell = OwnIt.shell(root, ctx, { zone: round && round.zone, total: total, side: false });
    var area = shell.area;
    shell.setScore(0, total);
    shell.startTimer();

    var panel = OwnIt.el('section', { 'class': 'panel wa-panel' });
    var bar = OwnIt.el('div', { 'class': 'cr-fuse', role: 'progressbar', 'aria-label': 'Seconds left', 'aria-valuemin': '0', 'aria-valuemax': String(CLOCK_MS / 1000), 'aria-valuenow': String(secsShown) });
    var line = OwnIt.el('div', { 'class': 'cr-fuse-line' });
    bar.appendChild(line);
    var meter = OwnIt.el('p', { 'class': 'wa-meter', 'aria-live': 'polite' });
    var card = OwnIt.el('div', { 'class': 'wa-card', 'aria-live': 'polite' });
    var roleEl = OwnIt.el('p', { 'class': 'wa-role' });
    var actionEl = OwnIt.el('h2', { 'class': 'wa-action' });
    card.appendChild(roleEl);
    card.appendChild(actionEl);
    var buttons = OwnIt.el('div', { 'class': 'wa-buttons' });
    var denyBtn = OwnIt.el('button', { type: 'button', 'class': 'wa-btn deny' }, 'Deny');
    var allowBtn = OwnIt.el('button', { type: 'button', 'class': 'wa-btn allow' }, 'Allow');
    buttons.appendChild(denyBtn);
    buttons.appendChild(allowBtn);
    var feedback = OwnIt.el('div', { 'class': 'quiz-feedback', 'aria-live': 'polite' });
    panel.appendChild(OwnIt.el('p', { 'class': 'wb-intro' }, 'Can this role do this? Tap Deny or Allow, press the left or right arrow, or swipe the card. You have 60 seconds.'));
    [bar, meter, card, buttons, feedback].forEach(function (n) { panel.appendChild(n); });
    area.appendChild(panel);

    function describe() {
      meter.textContent = 'Streak ' + streak + '. ' + xp + ' XP. Card ' + Math.min(at + 1, total) + ' of ' + total + '.';
    }

    function show() {
      roleEl.textContent = 'A ' + cards[at].role + ' tries to';
      actionEl.textContent = cards[at].action;
      describe();
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
      paintClock();
      if (elapsed >= CLOCK_MS) finish();
    }

    function judge(verdict) {
      if (done || at >= total) return;
      var c = cards[at];
      var truth = OwnItCore.decode(c.answer); // the only place a verdict is decoded
      var ok = truth === verdict;
      feedback.textContent = '';
      var phrase = 'A ' + c.role + ' ' + (truth === 'allow' ? 'may' : 'may not') + ': ' + c.action + '.';
      if (ok) {
        var pts = Math.round(XP_BASE * (1 + streak / 5));
        xp += pts;
        right++;
        streak++;
        OwnIt.sound('combo', streak);
        shell.setScore(right, total);
        feedback.appendChild(OwnIt.el('p', { 'class': 'quiz-xp' }, '+' + pts + ' XP'));
        kit.note(feedback, 'good', 'Right.', phrase + ' ' + c.why);
      } else {
        if (streak > 1) OwnIt.sound('streak-break');
        streak = 0;
        wrong.push(at);
        review.push({ text: phrase + ' ' + c.why });
        OwnIt.sound('wrong');
        OwnIt.juice.shake(card);
        kit.note(feedback, 'bad', 'Not quite.', phrase + ' ' + c.why);
      }
      at++;
      if (at >= total) return finish();
      show();
    }

    function finish() {
      if (done) return;
      done = true;
      stopClock();
      var missed = [];
      for (var i = 0; i < total; i++) if (i >= at || wrong.indexOf(i) >= 0) missed.push(String(i));
      if (right >= total) OwnIt.juice.confetti(panel);
      kit.finish(shell, ctx, { game: 'whos-allowed', mode: mode, got: right, of: total, xp: xp, missed: missed, review: review });
    }

    denyBtn.addEventListener('click', function () { judge('deny'); });
    allowBtn.addEventListener('click', function () { judge('allow'); });
    card.addEventListener('touchstart', function (e) {
      var t = e && e.touches && e.touches[0];
      touchX = t ? t.clientX : null;
    });
    card.addEventListener('touchend', function (e) {
      var t = e && e.changedTouches && e.changedTouches[0];
      if (touchX === null || !t) return;
      var dx = t.clientX - touchX;
      touchX = null;
      if (dx > SWIPE_PX) judge('allow'); else if (dx < -SWIPE_PX) judge('deny');
    });

    var offs = [];
    [['ArrowRight', 'allow'], ['ArrowLeft', 'deny']].forEach(function (p) {
      offs.push(ctx.keys.on(p[0], function (e) {
        if (kit.modalOpen() || !kit.mine(e, area)) return;
        if (e && e.preventDefault) e.preventDefault();
        judge(p[1]);
      }));
    });

    if (total) {
      show();
      paintClock();
      clock = setInterval(step, STEP_MS);
      if (allowBtn.focus) allowBtn.focus();
    } else {
      done = true;
      shell.stopTimer();
      roleEl.textContent = 'This round has no cards.';
      actionEl.textContent = 'Ask Claude to build a new who is allowed round, then pick it again from the board.';
    }

    return function () {
      done = true;
      stopClock();
      offs.forEach(function (off) { try { off(); } catch (e) { /* gone */ } });
      shell.destroy();
    };
  }

  OwnIt.register({
    id: 'whos-allowed',
    name: "Who's Allowed?",
    minutes: 3,
    keys: [['Left', 'Deny'], ['Right', 'Allow'], ['Esc', 'Leave']],
    play: play
  });
})();
