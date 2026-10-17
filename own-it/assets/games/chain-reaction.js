/* own-it game template: Chain Reaction (design spec 5d, frontend spec 6.3). The steps of one flow lie scattered. A fuse burns for 30 s.
   The player lights the steps in the order they happen: +10 XP each, and the combo sound climbs with every right click. A wrong click
   sets that card off (shake, wrong sound), nothing is lost but the streak, and the same step is tried again. When the fuse is out
   the steps still unlit count as missed. The order arrives obfuscated and is decoded only on a click. Keys 1-9 click the nth card.
   Builds DOM with OwnIt.el only. */
(function () {
  'use strict';
  var OwnIt = window.OwnIt;
  var kit = OwnIt.kit;
  var XP_STEP = 10, FUSE_MS = 30000, STEP_MS = 100, TICKS_FROM = 5, BOOM_MS = 420;

  function play(root, round, ctx) {
    var cards = ((round && round.cards) || []).filter(function (c) { return c && typeof c.id === 'string'; });
    var total = cards.length;
    var labels = round && round.labels;
    var exam = (round && round.mode === 'exam') || OwnIt.mode === 'exam';
    var mode = exam ? 'exam' : 'practice';
    var L = function (c) { return c.label || kit.label(c.id, labels); };

    var done = false;
    var progress = 0;       // steps lit so far
    var streak = 0;
    var wrong = [];         // [clickedId, expectedId]
    var boomed = {};        // expected id -> true after an explosion on that step
    var lit = {};           // id -> true
    var elapsed = 0;
    var secsShown = Math.ceil(FUSE_MS / 1000);
    var timers = [];
    var fuseTimer = null;
    var cur = 0;
    var order = null;       // decoded on the first click

    var shell = OwnIt.shell(root, ctx, { zone: round && round.zone, total: total, side: false });
    var area = shell.area;
    shell.setScore(0, total);
    shell.startTimer();

    var panel = OwnIt.el('section', { 'class': 'panel cr-panel' });
    var goal = OwnIt.el('h2', { 'class': 'quiz-q' }, 'Light the steps of "' + kit.label(round && round.flow, labels) + '" in order before the fuse burns out.');
    var fuse = OwnIt.el('div', { 'class': 'cr-fuse', role: 'progressbar', 'aria-label': 'Seconds left on the fuse', 'aria-valuemin': '0', 'aria-valuemax': String(FUSE_MS / 1000), 'aria-valuenow': String(secsShown) });
    var line = OwnIt.el('div', { 'class': 'cr-fuse-line' });
    var spark = OwnIt.el('span', { 'class': 'cr-spark', 'aria-hidden': 'true' });
    line.appendChild(spark);
    fuse.appendChild(line);
    var board = OwnIt.el('div', { 'class': 'cr-board', role: 'group', 'aria-label': 'Steps' });
    var live = OwnIt.el('p', { 'class': 'cr-live quiz-why', 'aria-live': 'polite' }, 'Tap the step that happens first, or press 1 to 9.');
    [goal, fuse, board, live].forEach(function (n) { panel.appendChild(n); });
    area.appendChild(panel);

    var nums = [];
    var els = cards.map(function (c, i) {
      var b = OwnIt.el('button', { type: 'button', 'class': 'cr-card', 'data-id': c.id });
      var num = OwnIt.el('span', { 'class': 'cr-num', 'aria-hidden': 'true' }, i < 9 ? String(i + 1) : '');
      nums.push(num);
      b.appendChild(num);
      b.appendChild(OwnIt.el('span', { 'class': 'cr-text' }, L(c)));
      b.addEventListener('click', function () { cur = i; light(i); });
      board.appendChild(b);
      return b;
    });

    function later(fn, ms) {
      var t = setTimeout(function () { fn(); }, ms);
      timers.push(t);
      return t;
    }

    function stopFuse() { if (fuseTimer) { clearInterval(fuseTimer); fuseTimer = null; } }

    function paintFuse() {
      var left = Math.max(0, FUSE_MS - elapsed);
      var pct = Math.round(left / FUSE_MS * 1000) / 10;
      line.style.width = pct + '%';
      var secs = Math.ceil(left / 1000);
      if (secs !== secsShown) {
        secsShown = secs;
        fuse.setAttribute('aria-valuenow', String(secs));
        if (secs >= 1 && secs <= TICKS_FROM) OwnIt.sound('tick', secs);
      }
    }

    function burn() {
      if (done) return;
      elapsed += STEP_MS;
      paintFuse();
      if (elapsed >= FUSE_MS) {
        OwnIt.sound('wrong');
        OwnIt.juice.shake(board);
        live.textContent = 'The fuse burned out.';
        finish();
      }
    }

    function sequence() {
      if (order) return order;
      var dec = OwnItCore.decode(round.answer); // the only place the order is decoded
      order = Array.isArray(dec) ? dec : [];
      return order;
    }

    function light(i) {
      var c = cards[i];
      if (done || !c || lit[c.id]) return;
      var expected = sequence()[progress];
      if (c.id === expected) {
        lit[c.id] = true;
        progress++;
        streak++;
        els[i].classList.add('lit');
        els[i].setAttribute('aria-disabled', 'true');
        nums[i].textContent = String(progress);
        els[i].setAttribute('aria-label', 'Step ' + progress + ': ' + L(c));
        OwnIt.sound('combo', streak);
        shell.setScore(progress, total);
        live.textContent = progress >= total ? 'Chain complete.' : 'Right. Now the next step.';
        if (progress >= total) {
          OwnIt.sound('correct');
          OwnIt.juice.confetti(panel);
          finish();
        }
        return;
      }
      wrong.push([c.id, expected]);
      boomed[expected] = true;
      if (streak > 1) OwnIt.sound('streak-break');
      streak = 0;
      OwnIt.sound('wrong');
      OwnIt.juice.shake(board);
      els[i].classList.add('boom');
      later(function () { els[i].classList.remove('boom'); }, BOOM_MS);
      live.textContent = exam ? 'Not that one. Try again.' : 'That one does not happen next. Try again.';
    }

    function finish() {
      if (done) return;
      done = true;
      stopFuse();
      var seq = sequence();
      var missedIds = seq.filter(function (id) { return boomed[id] || !lit[id]; });
      var byId = {};
      cards.forEach(function (c) { byId[c.id] = c; });
      var review = missedIds.map(function (id) {
        return { text: 'Step ' + (seq.indexOf(id) + 1) + ' of ' + total + ': ' + (byId[id] ? L(byId[id]) : id) + '.' };
      });
      kit.finish(shell, ctx, { game: 'chain-reaction', mode: mode, got: progress, of: total, xp: progress * XP_STEP, missed: missedIds, review: review, extra: { wrong: wrong } });
    }

    var offs = [];
    for (var n = 1; n <= 9; n++) {
      (function (idx) {
        offs.push(ctx.keys.on(String(idx + 1), function () {
          if (kit.modalOpen() || idx >= total) return;
          cur = idx;
          if (els[idx].focus) els[idx].focus();
          light(idx);
        }));
      })(n - 1);
    }
    [['ArrowRight', 1], ['ArrowDown', 1], ['ArrowLeft', -1], ['ArrowUp', -1]].forEach(function (p) {
      offs.push(ctx.keys.on(p[0], function (e) {
        if (done || kit.modalOpen() || !kit.mine(e, area) || !total) return;
        if (e && e.preventDefault) e.preventDefault();
        cur = Math.max(0, Math.min(total - 1, cur + p[1]));
        els[cur].focus();
      }));
    });
    offs.push(kit.onActivate(ctx, area, 'Enter', function (e) {
      var at = kit.targetIndex(els, e);
      if (at >= 0) cur = at;
      if (total) light(cur);
    }));

    if (total) {
      paintFuse();
      fuseTimer = setInterval(burn, STEP_MS);
      if (els[0].focus) els[0].focus();
    } else {
      done = true;
      shell.stopTimer();
      live.textContent = 'This round has no steps. Ask Claude to build a new chain reaction round, then pick it again from the board.';
    }

    return function () {
      done = true;
      stopFuse();
      timers.forEach(function (t) { clearTimeout(t); });
      offs.forEach(function (off) { try { off(); } catch (e) { /* gone */ } });
      shell.destroy();
    };
  }

  OwnIt.register({
    id: 'chain-reaction',
    name: 'Chain Reaction',
    minutes: 3,
    keys: [['1-9', 'Light that step'], ['Arrows', 'Move between steps'], ['Enter', 'Light the focused step'], ['Esc', 'Leave']],
    play: play
  });
})();
