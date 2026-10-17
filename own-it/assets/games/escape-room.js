/* own-it game template: Escape Room (design spec 5e). A locked door and three puzzles, one at a time, each a small form: a role (may this
   role do this? Allow or Deny, one try), a flow (tap the steps in the order they happen, as in Chain Reaction) and a failure (pick the step
   that breaks, as in the 3am Pager). The flow and the failure forgive one slip; a second slip fails that puzzle. Each solved puzzle is 15 XP. When
   all three are solved the door swings open (fanfare, confetti); otherwise it stays shut and the result lists what to revisit. The verdicts, the
   order and the culprit arrive obfuscated and are decoded only when the player moves. Keys: arrows (or 1 and 2) judge the role, 1 to 9 tap a
   step or a suspect, Enter moves on. Logic comes from the shared kit (verdict, stepper, lazy). Builds DOM with OwnIt.el only. */
(function () {
  'use strict';
  var OwnIt = window.OwnIt;
  var kit = OwnIt.kit;
  var XP_PUZZLE = 15, SLIPS = 2, KINDS = ['role', 'flow', 'failure'];

  function isText(x) { return typeof x === 'string'; }
  function isCard(c) { return c && isText(c.id) && (c.label === undefined || isText(c.label)); }
  function validPuzzle(p) {
    if (!p || !isText(p.answer)) return false;
    if (p.kind === 'role') return isText(p.role) && isText(p.action) && isText(p.why);
    if (p.kind === 'flow') return isText(p.flow) && Array.isArray(p.cards) && p.cards.length >= 2 && p.cards.every(isCard);
    if (p.kind === 'failure') return isText(p.failure) && Array.isArray(p.logs) && p.logs.every(isText) && Array.isArray(p.cards) && p.cards.length >= 2 && p.cards.every(isCard);
    return false;
  }

  function play(root, round, ctx) {
    var puzzles = (round && round.puzzles) || [];
    var labels = round && round.labels;
    if (!Array.isArray(puzzles) || puzzles.length !== KINDS.length || !puzzles.every(validPuzzle) ||
        KINDS.some(function (k) { return !puzzles.some(function (p) { return p.kind === k; }); })) {
      throw new Error('This round cannot be played: malformed escape room round.');
    }
    var total = puzzles.length;
    var exam = (round && round.mode === 'exam') || OwnIt.mode === 'exam';
    var mode = exam ? 'exam' : 'practice';
    var L = function (c) { return c.label || kit.label(c.id, labels); };

    var done = false;
    var at = 0;
    var shown = false;       // the current puzzle is settled and the reveal is on screen
    var right = 0;
    var streak = 0;
    var missed = [];
    var review = [];
    var cur = null;          // { btns, pick(i) } of the puzzle on screen

    var shell = OwnIt.shell(root, ctx, { zone: round && round.zone, total: total, side: false });
    var area = shell.area;
    shell.setScore(0, total);
    shell.startTimer();

    var panel = OwnIt.el('section', { 'class': 'panel er-panel' });
    var door = OwnIt.el('div', { 'class': 'er-door', role: 'img', 'aria-label': 'The door is locked' });
    door.appendChild(OwnIt.el('span', { 'class': 'er-leaf left', 'aria-hidden': 'true' }));
    door.appendChild(OwnIt.el('span', { 'class': 'er-leaf right', 'aria-hidden': 'true' }));
    var locks = kit.dots(total);
    var meter = OwnIt.el('p', { 'class': 'wa-meter', 'aria-live': 'polite' });
    var box = OwnIt.el('div', { 'class': 'er-box' });
    var feedback = OwnIt.el('div', { 'class': 'quiz-feedback', 'aria-live': 'polite' });
    var actions = OwnIt.el('div', { 'class': 'actions quiz-actions' });
    var nextBtn = OwnIt.button('Next', 'primary', null);
    nextBtn.classList.add('er-next');
    nextBtn.setAttribute('hidden', 'hidden');
    actions.appendChild(nextBtn);
    panel.appendChild(OwnIt.el('p', { 'class': 'wb-intro' }, 'Solve three puzzles to open the door. Tap, or use the arrows and the keys 1 to 9. Enter moves on.'));
    [door, locks.el, meter, box, feedback, actions].forEach(function (x) { panel.appendChild(x); });
    area.appendChild(panel);

    // ---- the three mini forms. Each returns { btns, pick(i) } and calls settle(ok, line, reviewLine) once.
    function roleForm(p, settle) {
      var card = OwnIt.el('div', { 'class': 'wa-card' });
      card.appendChild(OwnIt.el('p', { 'class': 'wa-role' }, 'A ' + p.role + ' tries to'));
      card.appendChild(OwnIt.el('h2', { 'class': 'wa-action' }, p.action));
      var row = OwnIt.el('div', { 'class': 'wa-buttons' });
      var deny = OwnIt.el('button', { type: 'button', 'class': 'wa-btn deny er-deny' }, 'Deny');
      var allow = OwnIt.el('button', { type: 'button', 'class': 'wa-btn allow er-allow' }, 'Allow');
      row.appendChild(deny);
      row.appendChild(allow);
      box.appendChild(card);
      box.appendChild(row);
      var btns = [deny, allow], said = ['deny', 'allow'], used = false;
      function pick(i) {
        if (used || i < 0 || i > 1) return;
        used = true;
        btns.forEach(function (b) { b.setAttribute('aria-disabled', 'true'); });
        var v = kit.verdict(p, said[i]); // the verdict and its reason are decoded here
        settle(v.ok, v.phrase, v.phrase);
      }
      btns.forEach(function (b, i) { b.addEventListener('click', function () { pick(i); }); });
      return { btns: btns, pick: pick };
    }

    function flowForm(p, settle) {
      box.appendChild(OwnIt.el('h2', { 'class': 'quiz-q' }, 'Tap the steps of "' + kit.label(p.flow, labels) + '" in the order they happen.'));
      var board = OwnIt.el('div', { 'class': 'cr-board', role: 'group', 'aria-label': 'Steps' });
      box.appendChild(board);
      var steps = kit.stepper(kit.lazy(p.answer, function (d) { return Array.isArray(d) ? d : []; }));
      var byId = {};
      p.cards.forEach(function (c) { byId[c.id] = c; });
      var slips = 0, closed = false, lit = {}, nums = [];
      var btns = p.cards.map(function (c, i) {
        var b = OwnIt.el('button', { type: 'button', 'class': 'cr-card er-step' });
        var num = OwnIt.el('span', { 'class': 'cr-num', 'aria-hidden': 'true' }, i < 9 ? String(i + 1) : '');
        nums.push(num);
        b.appendChild(num);
        b.appendChild(OwnIt.el('span', { 'class': 'cr-text' }, L(c)));
        b.addEventListener('click', function () { pick(i); });
        board.appendChild(b);
        return b;
      });
      function order() { return steps.order().map(function (id) { return byId[id] ? L(byId[id]) : id; }).join(', then '); }
      function pick(i) {
        var c = p.cards[i];
        if (closed || !c || lit[c.id]) return;
        if (steps.take(c.id)) {
          lit[c.id] = true;
          btns[i].classList.add('lit');
          btns[i].setAttribute('aria-disabled', 'true');
          nums[i].textContent = String(steps.progress());
          OwnIt.sound('press');
          if (steps.progress() >= p.cards.length) { closed = true; settle(true, 'The order is ' + order() + '.', ''); }
          return;
        }
        slips++;
        btns[i].classList.add('boom');
        OwnIt.juice.shake(board);
        if (slips >= SLIPS) {
          closed = true;
          btns.forEach(function (b) { b.setAttribute('aria-disabled', 'true'); });
          var line = 'The order is ' + order() + '.';
          settle(false, line, line);
        } else {
          OwnIt.sound('wrong');
          feedback.textContent = '';
          kit.note(feedback, 'bad', 'Not that one.', 'One more slip fails this lock.');
        }
      }
      return { btns: btns, pick: pick };
    }

    function failureForm(p, settle) {
      box.appendChild(OwnIt.el('h2', { 'class': 'quiz-q' }, p.failure));
      var logEl = OwnIt.el('div', { 'class': 'pg-log', role: 'group', 'aria-label': 'Log lines' });
      p.logs.forEach(function (l) { logEl.appendChild(OwnIt.el('p', { 'class': 'pg-line' }, l)); });
      box.appendChild(logEl);
      box.appendChild(OwnIt.el('p', { 'class': 'wb-intro' }, 'Which step breaks first?'));
      var answersEl = OwnIt.el('div', { 'class': 'answers', role: 'group', 'aria-label': 'Steps' });
      box.appendChild(answersEl);
      var culprit = kit.lazy(p.answer);
      var slips = 0, closed = false;
      var btns = kit.answerButtons(answersEl, p.cards.map(L), function (i) { pick(i); });
      btns.forEach(function (b) { b.classList.add('er-pick'); });
      function pick(i) {
        var c = p.cards[i];
        if (closed || !c || btns[i].getAttribute('aria-disabled') === 'true') return;
        if (c.id === culprit()) { // the answer is decoded only on a pick
          closed = true;
          btns[i].classList.add('right');
          settle(true, L(c) + ' breaks first.', '');
          return;
        }
        slips++;
        btns[i].classList.add('wrong');
        btns[i].setAttribute('aria-disabled', 'true');
        if (slips >= SLIPS) {
          closed = true;
          var real = p.cards.filter(function (x) { return x.id === culprit(); })[0];
          var line = p.failure + ' It broke at ' + (real ? L(real) : 'a step you did not pick') + '.';
          settle(false, line, line);
        } else {
          OwnIt.sound('wrong');
          OwnIt.juice.shake(answersEl);
          feedback.textContent = '';
          kit.note(feedback, 'bad', 'Not that one.', 'The log says otherwise. One more slip fails this lock.');
        }
      }
      return { btns: btns, pick: pick };
    }

    var FORMS = { role: roleForm, flow: flowForm, failure: failureForm };

    function describe() { meter.textContent = 'Lock ' + Math.min(at + 1, total) + ' of ' + total + '. ' + right + ' open so far.'; }

    function show() {
      shown = false;
      feedback.textContent = '';
      box.textContent = '';
      nextBtn.setAttribute('hidden', 'hidden');
      locks.paint(at, false, 'Lock');
      describe();
      var index = at;
      cur = FORMS[puzzles[index].kind](puzzles[index], function (ok, line, reviewLine) { settle(index, ok, line, reviewLine); });
      if (cur.btns[0] && cur.btns[0].focus) cur.btns[0].focus();
    }

    function settle(index, ok, line, reviewLine) {
      if (done || shown || index !== at) return;
      shown = true;
      feedback.textContent = '';
      if (ok) {
        right++;
        streak++;
        locks.set(at, 'ok');
        OwnIt.sound('combo', streak);
        shell.setScore(right, total);
        feedback.appendChild(OwnIt.el('p', { 'class': 'quiz-xp' }, '+' + XP_PUZZLE + ' XP'));
        kit.note(feedback, 'good', 'Lock open.', line);
      } else {
        if (streak > 1) OwnIt.sound('streak-break');
        streak = 0;
        locks.set(at, 'bad');
        missed.push(String(at));
        review.push({ text: 'Lock ' + (at + 1) + ': ' + reviewLine });
        OwnIt.sound('wrong');
        OwnIt.juice.shake(box);
        kit.note(feedback, 'bad', 'This lock holds.', line);
      }
      locks.paint(at, true, 'Lock');
      describe();
      if (at + 1 >= total && right >= total) openDoor();
      kit.nextLabel(nextBtn, at, total);
    }

    function openDoor() {
      door.classList.add('open');
      door.setAttribute('aria-label', 'The door is open');
      OwnIt.sound('levelup');
      OwnIt.juice.confetti(panel);
    }

    function next() {
      if (done || !shown) return;
      at++;
      if (at >= total) return finish();
      show();
    }

    function finish() {
      if (done) return;
      done = true;
      kit.finish(shell, ctx, { game: 'escape-room', mode: mode, got: right, of: total, xp: right * XP_PUZZLE, missed: missed, review: review });
    }

    nextBtn.addEventListener('click', next);

    var offs = [];
    for (var n = 1; n <= 9; n++) {
      (function (idx) {
        offs.push(ctx.keys.on(String(idx + 1), function () {
          if (done || shown || kit.modalOpen() || !cur) return;
          cur.pick(idx);
        }));
      })(n - 1);
    }
    kit.arrowKeys(ctx, area, function (dx) {
      if (done || shown || !cur || puzzles[at].kind !== 'role' || !dx) return;
      cur.pick(dx < 0 ? 0 : 1);
    }).forEach(function (off) { offs.push(off); });
    offs.push(kit.onActivate(ctx, area, 'Enter', function (e) {
      if (shown) return next();
      var i = cur ? kit.targetIndex(cur.btns, e) : -1;
      if (i >= 0) cur.pick(i);
    }));

    show();

    return function () {
      done = true;
      kit.release(offs);
      shell.destroy();
    };
  }

  OwnIt.register({
    id: 'escape-room',
    name: 'Escape Room',
    minutes: 5,
    keys: [['Left and Right', 'Deny or allow'], ['1-9', 'Tap that step'], ['Enter', 'Use the focused one, then move on'], ['Esc', 'Leave']],
    play: play
  });
})();
