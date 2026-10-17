/* own-it game template: Blast Radius (design spec 5d, frontend spec 6.3). One part of the app is named as broken. The player taps every
   other part they think breaks with it, then presses Done. The set that really breaks arrives obfuscated (every part that depends on the
   broken one, directly or through others, nearest first) and is decoded only on Done. Score: precision = right taps / taps, recall =
   right taps / parts that break, XP = round(10 x 2PR / (P + R)). A ripple then spreads outward from the broken part to show what fell.
   Builds DOM with OwnIt.el only. */
(function () {
  'use strict';
  var OwnIt = window.OwnIt;
  var kit = OwnIt.kit;
  var XP_MAX = 10, RIPPLE_MS = 260, RIPPLE_TAIL = 700;

  function play(root, round, ctx) {
    var parts = ((round && round.cards) || []).filter(function (c) { return c && typeof c.id === 'string'; });
    var total = parts.length;
    var labels = round && round.labels;
    var exam = (round && round.mode === 'exam') || OwnIt.mode === 'exam';
    var mode = exam ? 'exam' : 'practice';
    var L = function (c) { return c.label || kit.label(c.id, labels); };
    var targetName = kit.label(round && round.target, labels);

    var done = false;
    var picked = {};        // part position -> true
    var cur = 0;
    var timers = [];

    var shell = OwnIt.shell(root, ctx, { zone: round && round.zone, total: 1, side: false });
    var area = shell.area;
    shell.startTimer();

    var panel = OwnIt.el('section', { 'class': 'panel br-panel' });
    var goal = OwnIt.el('h2', { 'class': 'quiz-q' }, targetName + ' breaks. Tap every part that breaks with it.');
    var core = OwnIt.el('div', { 'class': 'br-core', 'aria-hidden': 'true' });
    var board = OwnIt.el('div', { 'class': 'br-board', role: 'group', 'aria-label': 'Parts' });
    var status = OwnIt.el('p', { 'class': 'mm-status', 'aria-live': 'polite' });
    var actions = OwnIt.el('div', { 'class': 'actions' });
    var doneBtn = OwnIt.button('Done', 'primary', null);
    actions.appendChild(doneBtn);
    var feedback = OwnIt.el('div', { 'class': 'quiz-feedback', 'aria-live': 'polite' });
    [goal, core, board, status, actions, feedback].forEach(function (n) { panel.appendChild(n); });
    area.appendChild(panel);

    var els = parts.map(function (c, i) {
      var b = OwnIt.el('button', { type: 'button', 'class': 'br-part', 'aria-pressed': 'false' }, L(c));
      b.addEventListener('click', function () { cur = i; toggle(i); });
      board.appendChild(b);
      return b;
    });

    function count() { return Object.keys(picked).length; }
    function describe() { status.textContent = kit.plural(count(), 'part', 'parts') + ' chosen.'; }

    function toggle(i) {
      if (done || !parts[i]) return;
      if (picked[i]) delete picked[i]; else picked[i] = true;
      els[i].classList.toggle('on', !!picked[i]);
      els[i].setAttribute('aria-pressed', picked[i] ? 'true' : 'false');
      OwnIt.sound('press');
      describe();
    }

    function later(fn, ms) { timers.push(setTimeout(fn, ms)); }

    function submit() {
      if (done) return;
      done = true;
      els.forEach(function (b) { b.setAttribute('aria-disabled', 'true'); });
      doneBtn.setAttribute('hidden', 'hidden');
      var dec = OwnItCore.decode(round.answer); // the only place the damage set is decoded
      var order = Array.isArray(dec) ? dec : [];
      var idx = {};
      parts.forEach(function (c, i) { idx[c.id] = i; });
      var breaks = order.filter(function (id) { return Object.prototype.hasOwnProperty.call(idx, id); });
      var isBreak = {};
      breaks.forEach(function (id) { isBreak[idx[id]] = true; });
      var hit = 0, falseAlarm = [], notPicked = [];
      parts.forEach(function (c, i) {
        if (picked[i] && isBreak[i]) hit++;
        else if (picked[i]) falseAlarm.push(i);
        else if (isBreak[i]) notPicked.push(i);
      });
      var n = count(), m = breaks.length;
      var precision = n ? hit / n : 0;
      var recall = m ? hit / m : 0;
      var f = precision + recall ? 2 * precision * recall / (precision + recall) : 0;
      var xp = Math.round(XP_MAX * f);
      var reduced = OwnIt.reduced();

      // Ripple outward from the broken part, nearest dependants first.
      core.classList.add('ripple');
      breaks.forEach(function (id, k) {
        var el = els[idx[id]];
        var apply = function () { el.classList.add('fell'); el.classList.add(picked[idx[id]] ? 'hit' : 'missed'); };
        if (reduced) apply(); else later(apply, k * RIPPLE_MS);
      });
      falseAlarm.forEach(function (i) { els[i].classList.add('false-alarm'); });
      OwnIt.sound(f >= 0.99 ? 'correct' : f > 0 ? 'hint' : 'wrong');
      if (f < 0.99) OwnIt.juice.shake(board); else OwnIt.juice.confetti(panel);
      kit.note(feedback, f >= 0.99 ? 'good' : 'bad', 'You found ' + hit + ' of ' + m + ' parts that break, with ' + kit.plural(falseAlarm.length, 'false alarm', 'false alarms') + '.',
        '+' + xp + ' XP.');
      shell.setScore(hit, m);

      var review = notPicked.map(function (i) { return { text: L(parts[i]) + ' also breaks when ' + targetName + ' does.' }; })
        .concat(falseAlarm.map(function (i) { return { text: L(parts[i]) + ' does not depend on ' + targetName + '.' }; }));
      var send = function () {
        kit.finish(shell, ctx, { game: 'blast-radius', mode: mode, got: hit, of: m, xp: xp,
          missed: notPicked.map(function (i) { return parts[i].id; }), review: review,
          extra: { precision: precision, recall: recall, falseAlarms: falseAlarm.map(function (i) { return parts[i].id; }),
            formula: 'xp = round(10 * 2PR / (P + R)), P = precision, R = recall' } });
      };
      if (reduced || !breaks.length) send(); else later(send, breaks.length * RIPPLE_MS + RIPPLE_TAIL);
    }

    doneBtn.addEventListener('click', submit);

    var offs = [];
    function move(delta) {
      if (done || !total) return;
      cur = Math.max(0, Math.min(total - 1, cur + delta));
      els[cur].focus();
    }
    [['ArrowRight', 1], ['ArrowDown', 1], ['ArrowLeft', -1], ['ArrowUp', -1]].forEach(function (p) {
      offs.push(ctx.keys.on(p[0], function (e) {
        if (kit.modalOpen() || !kit.mine(e, area)) return;
        if (e && e.preventDefault) e.preventDefault();
        move(p[1]);
      }));
    });
    [' ', 'Enter'].forEach(function (k) {
      offs.push(kit.onActivate(ctx, area, k, function (e) {
        if (e && e.target === doneBtn) return submit();
        var i = kit.targetIndex(els, e);
        if (i >= 0) cur = i;
        toggle(cur);
      }));
    });
    offs.push(kit.onActivate(ctx, area, 'd', submit));

    if (total) {
      describe();
      if (els[0].focus) els[0].focus();
    } else {
      done = true;
      shell.stopTimer();
      status.textContent = 'This round has no parts. Ask Claude to build a new blast radius round, then pick it again from the board.';
    }

    return function () {
      done = true;
      timers.forEach(function (t) { clearTimeout(t); });
      offs.forEach(function (off) { try { off(); } catch (e) { /* gone */ } });
      shell.destroy();
    };
  }

  OwnIt.register({
    id: 'blast-radius',
    name: 'Blast Radius',
    minutes: 4,
    keys: [['Arrows', 'Move between parts'], ['Space', 'Mark or unmark the part'], ['D', 'Done'], ['Esc', 'Leave']],
    play: play
  });
})();
