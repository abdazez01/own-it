/* own-it game template: Chain Reaction (design spec 5d, frontend spec 6.3). The steps of one flow lie scattered. A fuse burns for 30 s.
   The player lights the steps in the order they happen: +10 XP each, and the combo sound climbs with every right click. A wrong click
   sets that card off (shake, wrong sound), nothing is lost but the streak, and the same step is tried again. When the fuse is out
   the steps still unlit count as missed. The order arrives obfuscated and is decoded only on a click. Keys 1-9 click the nth card.
   Builds DOM with OwnIt.el only. */
(function () {
  'use strict';
  var OwnIt = window.OwnIt;
  var kit = OwnIt.kit;
  var XP_STEP = 10, FUSE_MS = 30000, BOOM_MS = 420;

  function play(root, round, ctx) {
    var cards = ((round && round.cards) || []).filter(function (c) { return c && typeof c.id === 'string'; });
    var total = cards.length;
    var labels = round && round.labels;
    var exam = (round && round.mode === 'exam') || OwnIt.mode === 'exam';
    var mode = exam ? 'exam' : 'practice';
    var L = function (c) { return c.label || kit.label(c.id, labels); };

    var done = false;
    var streak = 0;
    var wrong = [];         // [clickedId, expectedId]
    var boomed = {};        // expected id -> true after an explosion on that step
    var lit = {};           // id -> true
    var timers = [];
    var fuse = null;        // the kit clock
    var cur = 0;
    var steps = kit.stepper(kit.lazy(round && round.answer, function (dec) { return Array.isArray(dec) ? dec : []; })); // decoded on the first click

    var shell = OwnIt.shell(root, ctx, { zone: round && round.zone, total: total, side: false });
    var area = shell.area;
    shell.setScore(0, total);
    shell.startTimer();

    var panel = OwnIt.el('section', { 'class': 'panel cr-panel' });
    var goal = OwnIt.el('h2', { 'class': 'quiz-q' }, 'Light the steps of "' + kit.label(round && round.flow, labels) + '" in order before the fuse burns out.');
    var board = OwnIt.el('div', { 'class': 'cr-board', role: 'group', 'aria-label': 'Steps' });
    var live = OwnIt.el('p', { 'class': 'cr-live quiz-why', 'aria-live': 'polite' }, 'Tap the step that happens first, or press 1 to 9.');
    panel.appendChild(goal);
    if (total) fuse = kit.clock(panel, FUSE_MS, { label: 'Seconds left on the fuse', spark: true, onEnd: burnOut });
    [board, live].forEach(function (n) { panel.appendChild(n); });
    area.appendChild(panel);

    var nums = [];
    var els = cards.map(function (c, i) {
      var b = OwnIt.el('button', { type: 'button', 'class': 'cr-card' });
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

    function burnOut() {
      if (done) return;
      OwnIt.sound('wrong');
      OwnIt.juice.shake(board);
      live.textContent = 'The fuse burned out.';
      finish();
    }

    function light(i) {
      var c = cards[i];
      if (done || !c || lit[c.id]) return;
      var expected = steps.expected();
      if (steps.take(c.id)) {
        var progress = steps.progress();
        lit[c.id] = true;
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
      if (fuse) fuse.stop();
      var seq = steps.order();
      var missedIds = seq.filter(function (id) { return !lit[id]; });
      var byId = {};
      cards.forEach(function (c) { byId[c.id] = c; });
      var say = function (id, lead) {
        return { text: lead + 'Step ' + (seq.indexOf(id) + 1) + ' of ' + total + ': ' + (byId[id] ? L(byId[id]) : id) + '.' };
      };
      var review = seq.filter(function (id) { return boomed[id] || !lit[id]; }).map(function (id) { return say(id, lit[id] ? 'Lit after a retry. ' : ''); });
      kit.finish(shell, ctx, { game: 'chain-reaction', mode: mode, got: steps.progress(), of: total, xp: steps.progress() * XP_STEP, missed: missedIds, review: review, extra: { wrong: wrong } });
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
      if (els[0].focus) els[0].focus();
    } else {
      done = true;
      shell.stopTimer();
      live.textContent = 'This round has no steps. Ask Claude to build a new chain reaction round, then pick it again from the board.';
    }

    return function () {
      done = true;
      if (fuse) fuse.stop();
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
