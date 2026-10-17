/* own-it game template: Data Detective (design spec 5e). One record lives through a lifecycle. Its status cards lie scattered. The player stamps
   them onto a timeline in the order they happen (tap, or keys 1-9). After each stamp past the first, the player says who moved the record
   from the status before: one of the roles offered. Every right stamp and every right "who" is worth 10 XP and keeps the combo going. A wrong
   stamp shakes and is tried again, a wrong "who" shows the right one. The order and the movers arrive obfuscated and are decoded on the first
   action. Builds DOM with OwnIt.el only. */
(function () {
  'use strict';
  var OwnIt = window.OwnIt;
  var kit = OwnIt.kit;
  var XP_EACH = 10;

  function play(root, round, ctx) {
    var cards = ((round && round.cards) || []).filter(function (c) { return c && typeof c.id === 'string'; });
    var who = ((round && round.who) || []).filter(function (c) { return c && typeof c.id === 'string'; });
    var n = cards.length;
    var total = n ? n + n - 1 : 0;      // n stamps and n - 1 movers
    var labels = round && round.labels;
    var exam = (round && round.mode === 'exam') || OwnIt.mode === 'exam';
    var mode = exam ? 'exam' : 'practice';
    var L = function (c) { return c.label || kit.label(c.id, labels); };
    var byId = {};
    cards.forEach(function (c) { byId[c.id] = c; });
    var whoById = {};
    who.forEach(function (c) { whoById[c.id] = c; });

    var done = false;
    var stamped = 0;       // slots filled
    var phase = 'stamp';   // 'stamp' while a status is wanted, 'who' while a mover is wanted
    var right = 0;
    var streak = 0;
    var used = {};         // card id -> true
    var wrongStamps = [];  // [clickedId, expectedId]
    var wrongWho = [];     // [pickedId, expectedId]
    var retried = {};      // state id -> true after a wrong stamp on that step
    var missed = {};       // state id -> true for a step that cost points
    var review = [];
    var curCard = 0, curWho = 0;
    var truth = null;      // decoded on the first action
    var tm = kit.timers();

    var shell = OwnIt.shell(root, ctx, { zone: round && round.zone, total: total, side: false });
    var area = shell.area;
    shell.setScore(0, total);
    shell.startTimer();

    var panel = OwnIt.el('section', { 'class': 'panel dd-panel' });
    var goal = OwnIt.el('h2', { 'class': 'quiz-q' }, 'Follow ' + kit.label(round && round.entity, labels) + ' from start to finish. Stamp each status in order, then say who moved it.');
    var line = OwnIt.el('ol', { 'class': 'dd-line', 'aria-label': 'Timeline' });
    var slots = [];
    var tray = OwnIt.el('div', { 'class': 'dd-tray', role: 'group', 'aria-label': 'Statuses' });
    var whoBox = OwnIt.el('div', { 'class': 'dd-whos', role: 'group', 'aria-label': 'Who moved it', hidden: 'hidden' });
    var ask = OwnIt.el('p', { 'class': 'dd-ask' });
    var whoRow = OwnIt.el('div', { 'class': 'dd-who-row' });
    var live = OwnIt.el('p', { 'class': 'dd-live quiz-why', 'aria-live': 'polite' }, 'Tap the status that comes first, or press 1 to 9.');
    whoBox.appendChild(ask);
    whoBox.appendChild(whoRow);
    [goal, line, tray, whoBox, live].forEach(function (x) { panel.appendChild(x); });
    area.appendChild(panel);

    for (var s = 0; s < n; s++) {
      var li = OwnIt.el('li', { 'class': 'dd-slot' });
      li.appendChild(OwnIt.el('span', { 'class': 'dd-slot-num', 'aria-hidden': 'true' }, String(s + 1)));
      li.appendChild(OwnIt.el('span', { 'class': 'dd-slot-text' }, 'Empty'));
      li.appendChild(OwnIt.el('span', { 'class': 'dd-slot-by' }));
      slots.push(li);
      line.appendChild(li);
    }

    var cardEls = cards.map(function (c, i) {
      var b = OwnIt.el('button', { type: 'button', 'class': 'dd-card' });
      b.appendChild(OwnIt.el('span', { 'class': 'dd-key', 'aria-hidden': 'true' }, i < 9 ? String(i + 1) : ''));
      b.appendChild(OwnIt.el('span', { 'class': 'dd-text' }, L(c)));
      b.addEventListener('click', function () { curCard = i; stamp(i); });
      tray.appendChild(b);
      return b;
    });
    var whoEls = who.map(function (c, i) {
      var b = OwnIt.el('button', { type: 'button', 'class': 'dd-who' }, L(c));
      b.addEventListener('click', function () { curWho = i; pick(i); });
      whoRow.appendChild(b);
      return b;
    });

    function truthOf() {
      if (truth) return truth;
      var dec = OwnItCore.decode(round.answer); // the only place the lifecycle is decoded
      truth = { order: Array.isArray(dec && dec.order) ? dec.order : [], by: Array.isArray(dec && dec.by) ? dec.by : [] };
      return truth;
    }

    function setPhase(next) {
      phase = next;
      if (next === 'who') whoBox.removeAttribute('hidden'); else whoBox.setAttribute('hidden', 'hidden');
      cardEls.forEach(function (b, i) { if (!used[cards[i].id]) b.setAttribute('aria-disabled', next === 'who' ? 'true' : 'false'); });
    }

    function firstFree() {
      for (var i = 0; i < n; i++) if (!used[cards[i].id]) return i;
      return 0;
    }

    function score() { right++; streak++; OwnIt.sound('combo', streak); shell.setScore(right, total); }
    function miss() { if (streak > 1) OwnIt.sound('streak-break'); streak = 0; OwnIt.sound('wrong'); }

    function stamp(i) {
      var c = cards[i];
      if (done || phase !== 'stamp' || !c || used[c.id]) return;
      var expected = truthOf().order[stamped];
      if (c.id !== expected) {
        wrongStamps.push([c.id, expected]);
        retried[expected] = true;
        miss();
        OwnIt.juice.shake(tray);
        cardEls[i].classList.add('boom');
        tm.later(function () { cardEls[i].classList.remove('boom'); }, 420);
        live.textContent = exam ? 'Not that one. Try again.' : 'That status does not come next. Try again.';
        return;
      }
      used[c.id] = true;
      cardEls[i].classList.add('used');
      cardEls[i].setAttribute('aria-disabled', 'true');
      slots[stamped].classList.add('stamped');
      slots[stamped].children[1].textContent = L(c);
      stamped++;
      score();
      if (stamped === 1) {
        live.textContent = 'Stamped. Now the next status.';
        if (stamped >= n) return finish();
        return;
      }
      ask.textContent = 'Who moved it from ' + L(byId[truthOf().order[stamped - 2]]) + ' to ' + L(c) + '?';
      setPhase('who');
      curWho = 0;
      live.textContent = 'Stamped. Now pick who moved it, or press 1 to ' + Math.min(9, who.length) + '.';
      if (whoEls[0] && whoEls[0].focus) whoEls[0].focus();
    }

    function pick(j) {
      var w = who[j];
      if (done || phase !== 'who' || !w) return;
      var step = stamped - 2;
      var expected = truthOf().by[step];
      var to = truthOf().order[stamped - 1];
      var from = truthOf().order[step];
      var tag = slots[stamped - 1].children[2];
      if (w.id === expected) {
        score();
        tag.textContent = 'Moved by ' + L(w);
        live.textContent = 'Right.';
      } else {
        wrongWho.push([w.id, expected]);
        missed[to] = true;
        miss();
        OwnIt.juice.shake(whoBox);
        var rightName = whoById[expected] ? L(whoById[expected]) : kit.label(expected, labels);
        tag.textContent = 'Moved by ' + rightName;
        review.push({ text: 'From ' + L(byId[from]) + ' to ' + L(byId[to]) + ' the mover is ' + rightName + ', not ' + L(w) + '.' });
        live.textContent = 'Not quite. It was ' + rightName + '.';
      }
      setPhase('stamp');
      if (stamped >= n) return finish();
      curCard = firstFree();
      if (cardEls[curCard] && cardEls[curCard].focus) cardEls[curCard].focus();
    }

    function finish() {
      if (done) return;
      done = true;
      var order = truthOf().order;
      order.forEach(function (id, k) {
        if (retried[id]) {
          missed[id] = true;
          review.unshift({ text: 'Step ' + (k + 1) + ' of ' + n + ' is ' + (byId[id] ? L(byId[id]) : id) + '. It took a retry.' });
        }
      });
      if (right >= total) { OwnIt.sound('correct'); OwnIt.juice.confetti(panel); }
      kit.finish(shell, ctx, { game: 'data-detective', mode: mode, got: right, of: total, xp: right * XP_EACH,
        missed: Object.keys(missed), review: review, extra: { wrong: wrongStamps, wrongWho: wrongWho } });
    }

    var offs = [];
    for (var d = 1; d <= 9; d++) {
      (function (idx) {
        offs.push(ctx.keys.on(String(idx + 1), function () {
          if (kit.modalOpen()) return;
          if (phase === 'who') { curWho = idx; pick(idx); } else { curCard = idx; stamp(idx); }
        }));
      })(d - 1);
    }
    offs = offs.concat(kit.arrowKeys(ctx, area, function (dx, dy) {
      if (done || !total) return;
      var step = dx + dy;
      if (phase === 'who') {
        curWho = Math.max(0, Math.min(who.length - 1, curWho + step));
        if (whoEls[curWho]) whoEls[curWho].focus();
      } else {
        curCard = Math.max(0, Math.min(n - 1, curCard + step));
        cardEls[curCard].focus();
      }
    }));
    offs.push(kit.onActivate(ctx, area, 'Enter', function (e) {
      if (phase === 'who') {
        var w = kit.targetIndex(whoEls, e);
        if (w >= 0) curWho = w;
        pick(curWho);
      } else {
        var c = kit.targetIndex(cardEls, e);
        if (c >= 0) curCard = c;
        stamp(curCard);
      }
    }));

    if (n >= 2 && who.length >= 2) {
      if (cardEls[0].focus) cardEls[0].focus();
    } else {
      done = true;
      shell.stopTimer();
      live.textContent = 'This round has no timeline. Ask Claude to build a new data detective round, then pick it again from the board.';
    }

    return function () {
      done = true;
      tm.clear();
      kit.release(offs);
      shell.destroy();
    };
  }

  OwnIt.register({
    id: 'data-detective',
    name: 'Data Detective',
    minutes: 4,
    keys: [['1-9', 'Stamp a status, or pick who'], ['Arrows', 'Move between choices'], ['Enter', 'Choose the focused one'], ['Esc', 'Leave']],
    play: play
  });
})();
