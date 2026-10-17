/* own-it game template: Next Tick. One real moment of the app is frozen as a scene: a small state table of entity fields, drawn as split-flap tiles.
   Each tick the player predicts what happens next (keys 1-4). The table then flips to the new state, the reason shows, and so does the code line that
   ran (file:line). A round is 4 to 6 ticks along one flow and ends with a timeline of every tick. 10 XP per right tick plus a streak bonus.
   Levels: easy has 3 options and the changed field lit up; hard has no light and near-miss options; impossible runs a timer per tick and asks one
   tick for the exact new value. The right option, the changes, the reasons and the code lines arrive obfuscated and are decoded only on an answer.
   On the last tick the player may explain why in words; that goes to Claude as an `ask` event (q1). Builds DOM with OwnIt.el only. */
(function () {
  'use strict';
  var OwnIt = window.OwnIt;
  var kit = OwnIt.kit;
  var XP_TICK = 10, BONUS_STEP = 2, BONUS_MAX = 10, TICK_MS = 20000, KEY = 'q1';
  var LEVELS = ['easy', 'medium', 'hard', 'impossible'];
  var HOWTO = 'The table is one frozen moment of your app. Press 1 to 4 to pick what happens on the next tick. The changed fields flip, then the reason and the code line show. Press Enter for the next tick.';

  function play(root, round, ctx) {
    var ticks = (round && round.ticks) || [];
    var start = round && round.start;
    var valid = Array.isArray(ticks) && ticks.length > 0 && start && start.fields && typeof start.fields === 'object' &&
      ticks.every(function (t) { return t && Array.isArray(t.options) && t.options.length >= 2 && typeof t.answer === 'string' && typeof t.changes === 'string'; });
    if (!valid) throw new Error('This round cannot be played: malformed next tick round.');
    var total = ticks.length;
    var labels = round.labels;
    var exam = round.mode === 'exam' || OwnIt.mode === 'exam';
    var mode = exam ? 'exam' : 'practice';
    var level = LEVELS.indexOf(round.level === 'custom' ? round.levelBase : round.level) >= 0 ? (round.level === 'custom' ? round.levelBase : round.level) : OwnIt.level(ctx.roundId);
    var timed = level === 'impossible';
    var fieldNames = Object.keys(start.fields);

    var done = false;
    var at = 0;              // current tick
    var locked = false;      // current tick answered
    var phase = 'play';      // 'play', 'timeline'
    var got = 0, xp = 0, streak = 0;
    var missed = [];         // step ids of ticks that cost points
    var history = [];        // one entry per answered tick, for the timeline
    var state = {};          // field -> current value
    fieldNames.forEach(function (f) { state[f] = start.fields[f]; });
    var typed = '';
    var tm = kit.timers();
    var clock = null;
    var btns = [];

    var shell = OwnIt.shell(root, ctx, { zone: round.zone, total: total, side: false });
    var area = shell.area;
    shell.setScore(0, total);
    shell.startTimer();

    var card = OwnIt.el('section', { 'class': 'panel nt-panel' });
    var dots = kit.dots(total);
    var scene = OwnIt.el('h2', { 'class': 'quiz-q nt-scene' }, start.entity);
    var flowLine = OwnIt.el('p', { 'class': 'nt-flow quiz-why' }, 'Following ' + kit.label(round.flow, labels) + '.');
    var table = OwnIt.el('div', { 'class': 'nt-table', role: 'group', 'aria-label': 'State of the scene' });
    var rows = {};
    fieldNames.forEach(function (f) {
      var row = OwnIt.el('div', { 'class': 'nt-row' });
      row.appendChild(OwnIt.el('span', { 'class': 'nt-field' }, f));
      var val = OwnIt.el('span', { 'class': 'nt-val' });
      row.appendChild(val);
      OwnIt.flap(val, String(state[f]), { instant: true });
      table.appendChild(row);
      rows[f] = { row: row, val: val };
    });
    var qText = OwnIt.el('h3', { 'class': 'nt-q', 'aria-live': 'polite' });
    var clockBox = OwnIt.el('div', { 'class': 'nt-clock' });
    var answersEl = OwnIt.el('div', { 'class': 'answers nt-answers', role: 'group', 'aria-label': 'Outcomes' });
    var feedback = OwnIt.el('div', { 'class': 'quiz-feedback nt-feedback', 'aria-live': 'polite' });
    var explain = OwnIt.el('div', { 'class': 'nt-explain', hidden: 'hidden' });
    var box = OwnIt.el('textarea', { 'class': 'boss-answer nt-text', rows: '3', maxlength: '600', 'aria-label': 'Why did this happen? Optional', placeholder: 'Optional: say in your own words why this happened.' });
    var sendBtn = OwnIt.button('Send my explanation', 'quiet', null);
    var sendNote = OwnIt.el('p', { 'class': 'nt-sent quiz-why', 'aria-live': 'polite' });
    [box, sendBtn, sendNote].forEach(function (n) { explain.appendChild(n); });
    var actions = OwnIt.el('div', { 'class': 'actions quiz-actions' });
    var nextBtn = OwnIt.button('Next tick', 'primary', null);
    nextBtn.setAttribute('hidden', 'hidden');
    actions.appendChild(nextBtn);
    var howto = OwnIt.el('p', { 'class': 'nt-howto quiz-why' });
    howto.appendChild(OwnIt.el('strong', null, 'How to play. '));
    howto.appendChild(OwnIt.el('span', null, HOWTO));
    var left = OwnIt.el('div', { 'class': 'nt-col nt-left' });
    var right = OwnIt.el('div', { 'class': 'nt-col nt-right' });
    [dots.el, scene, flowLine, table, howto].forEach(function (n) { left.appendChild(n); });
    [qText, clockBox, answersEl, feedback, explain, actions].forEach(function (n) { right.appendChild(n); });
    card.appendChild(left);
    card.appendChild(right);
    area.appendChild(card);

    var asker = kit.asker(ctx, {
      onGrade: function () { sendNote.textContent = 'Claude read your explanation. It counts toward Curiosity XP.'; },
      onUnsent: function () { sendNote.textContent = 'Could not reach Claude. Your words go in the result instead.'; sendBtn.removeAttribute('hidden'); },
      onSkip: function () { sendNote.textContent = 'Sent. Claude will read it in the debrief.'; },
      onOffline: function () { sendNote.textContent = 'Sent. Claude will read it in the debrief.'; }
    });

    function say(cls, lead, text) { return kit.note(feedback, cls, lead, text); }

    function stopClock() { if (clock) { clock.stop(); clock = null; } clockBox.textContent = ''; }

    function paintTable(hl) {
      fieldNames.forEach(function (f) {
        var on = hl && hl.indexOf(f) >= 0;
        rows[f].row.classList.remove('changed');
        if (on) rows[f].row.classList.add('hl'); else rows[f].row.classList.remove('hl');
      });
    }

    function render() {
      locked = false;
      var t = ticks[at];
      var val = t.value;
      var texts = val ? val.options : t.options.map(function (o) { return o.text; });
      qText.textContent = val ? 'Tick ' + (at + 1) + ' of ' + total + '. What is the exact new value of ' + val.field + '?' : 'Tick ' + (at + 1) + ' of ' + total + '. What happens next?';
      feedback.textContent = '';
      explain.setAttribute('hidden', 'hidden');
      nextBtn.setAttribute('hidden', 'hidden');
      answersEl.removeAttribute('hidden');
      btns = kit.answerButtons(answersEl, texts, function (i) { pick(at, i); });
      paintTable(level === 'easy' ? t.hl : null);
      dots.paint(at, false, 'Tick');
      stopClock();
      if (timed) clock = kit.clock(clockBox, TICK_MS, { label: 'Seconds left on this tick', spark: true, onEnd: function () { pick(at, -1); } });
    }

    // Plays the new state into the table: only the changed fields flip.
    function applyChanges(ch) {
      Object.keys(ch).forEach(function (f) {
        if (!rows[f]) return;
        state[f] = ch[f];
        rows[f].row.classList.remove('hl');
        rows[f].row.classList.add('changed');
        OwnIt.flap(rows[f].val, String(ch[f]), { sound: true });
      });
    }

    function pick(i, choice) {
      if (done || locked || i !== at || phase !== 'play') return;
      var t = ticks[at];
      var val = t.value;
      var count = val ? val.options.length : t.options.length;
      if (choice >= count) return;
      locked = true;
      stopClock();
      var right = OwnItCore.decode(t.answer);            // the only place an answer is decoded
      var changes = OwnItCore.decode(t.changes) || {};   // the new state, decoded now
      var truth = val ? OwnItCore.decode(val.answer) : right;
      var ok = choice === truth;
      var entry = { step: t.step, ok: ok, picked: choice, right: right, timeout: choice < 0 };
      btns.forEach(function (b) { b.setAttribute('aria-disabled', 'true'); });
      if (choice >= 0) btns[choice].classList.add('picked');
      if (ok) {
        got++; streak++;
        entry.gain = XP_TICK + Math.min(BONUS_MAX, (streak - 1) * BONUS_STEP);
        xp += entry.gain;
        OwnIt.sound('combo', streak);
      } else {
        missed.push(t.step);
        if (streak > 1) OwnIt.sound('streak-break');
        streak = 0;
        OwnIt.sound('wrong');
        OwnIt.juice.shake(card);
      }
      shell.setScore(got, total);
      dots.set(at, exam ? 'set' : ok ? 'ok' : 'bad');
      applyChanges(changes);
      entry.text = t.options[right].text;
      entry.mine = choice >= 0 && !val && t.options[choice] ? t.options[choice].text : '';
      history.push(entry);
      if (exam) {
        say('locked', 'Locked in.', 'The table moved on. Reasons and code lines show at the end.');
      } else {
        btns[truth].classList.add('right');
        if (choice >= 0 && !ok) btns[choice].classList.add('wrong');
        entry.why = OwnItCore.decode(t.options[right].why);
        entry.ref = OwnItCore.decode(t.ref);
        if (ok) say('good', '+' + entry.gain + ' XP.', entry.why);
        else {
          if (entry.timeout) say('bad', 'Time is up.', 'Here is what happened: ' + entry.text + '.');
          else if (!val) say('bad', 'Why not:', OwnItCore.decode(t.options[choice].why));
          if (!entry.timeout) say('good', 'What happened:', entry.text + '. ' + entry.why);
        }
        var line = OwnIt.el('p', { 'class': 'quiz-why nt-ref' });
        line.appendChild(OwnIt.el('strong', null, 'This ran at '));
        line.appendChild(OwnIt.el('code', { 'class': 'nt-code' }, entry.ref));
        feedback.appendChild(line);
      }
      dots.paint(at, true, 'Tick');
      if (at + 1 >= total) {
        explain.removeAttribute('hidden');
        nextBtn.textContent = 'See timeline';
        nextBtn.removeAttribute('hidden');
        if (nextBtn.focus) nextBtn.focus();
      } else {
        kit.nextLabel(nextBtn, at, total);
        nextBtn.textContent = 'Next tick';
      }
    }

    function next() {
      if (done || !locked || phase !== 'play') return;
      if (at + 1 >= total) return showTimeline();
      at++;
      render();
    }

    function send() {
      var text = String(box.value || '').trim();
      if (!text) { sendNote.textContent = 'Write a few words first, or skip this.'; return; }
      typed = text;
      sendBtn.setAttribute('hidden', 'hidden');
      sendNote.textContent = asker.send(KEY, text) ? 'Sent to Claude.' : 'Saved. It goes in the result for Claude to read.';
    }

    function showTimeline() {
      phase = 'timeline';
      stopClock();
      asker.release();
      var perfect = got >= total;
      var panel = OwnIt.el('section', { 'class': 'panel nt-panel nt-end' });
      panel.appendChild(OwnIt.el('h2', { 'class': 'quiz-q' }, 'The whole flow, tick by tick'));
      var list = OwnIt.el('ol', { 'class': 'nt-timeline', 'aria-label': 'Timeline' });
      history.forEach(function (h, k) {
        var t = ticks[k];
        var li = OwnIt.el('li', { 'class': 'nt-step ' + (h.ok ? 'ok' : 'bad') });
        li.appendChild(OwnIt.el('span', { 'class': 'nt-step-n' }, String(k + 1)));
        var body = OwnIt.el('div', { 'class': 'nt-step-body' });
        body.appendChild(OwnIt.el('p', { 'class': 'nt-step-what' }, h.text));
        if (!h.ok) body.appendChild(OwnIt.el('p', { 'class': 'nt-step-miss quiz-why' }, h.timeout ? 'Time ran out.' : h.mine ? 'You said: ' + h.mine : 'You missed the exact value.'));
        h.why = h.why || OwnItCore.decode(t.options[h.right].why);
        h.ref = h.ref || OwnItCore.decode(t.ref);
        body.appendChild(OwnIt.el('p', { 'class': 'nt-step-why quiz-why' }, h.why));
        var loc = OwnIt.el('p', { 'class': 'nt-step-ref quiz-why' });
        loc.appendChild(OwnIt.el('code', { 'class': 'nt-code' }, h.ref));
        body.appendChild(loc);
        li.appendChild(body);
        list.appendChild(li);
      });
      panel.appendChild(list);
      var actions2 = OwnIt.el('div', { 'class': 'actions quiz-actions' });
      var go = OwnIt.button('See result', 'primary', null);
      go.addEventListener('click', finish);
      actions2.appendChild(go);
      panel.appendChild(actions2);
      area.textContent = '';
      area.appendChild(panel);
      if (perfect) { OwnIt.sound('correct'); OwnIt.juice.confetti(panel); }
      if (go.focus) go.focus();
    }

    function finish() {
      if (done) return;
      done = true;
      asker.cancel();
      var review = [];
      history.forEach(function (h, k) {
        if (!h.ok) review.push({ text: 'Tick ' + (k + 1) + ' of ' + total + ': ' + h.text + '. ' + h.why, ref: h.ref });
      });
      var extra = { wrong: history.filter(function (h) { return !h.ok; }).map(function (h) { return [h.step, h.step]; }) };
      if (typed) { extra.text = {}; extra.text[KEY] = typed; }
      kit.finish(shell, ctx, { game: 'next-tick', mode: mode, got: got, of: total, xp: xp, missed: missed, review: review, extra: extra });
    }

    nextBtn.addEventListener('click', next);
    sendBtn.addEventListener('click', send);
    box.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); e.stopPropagation(); send(); }
    });

    var offs = [1, 2, 3, 4].map(function (n) {
      return ctx.keys.on(String(n), function () {
        if (kit.modalOpen() || done || phase !== 'play') return;
        if (btns[n - 1]) { if (btns[n - 1].focus) btns[n - 1].focus(); pick(at, n - 1); }
      });
    });
    offs.push(kit.onActivate(ctx, area, 'Enter', function (e) {
      if (phase === 'timeline') { finish(); return; }
      if (!locked) {
        var hit = kit.targetIndex(btns, e);
        if (hit >= 0) pick(at, hit);
        return;
      }
      next();
    }));

    render();

    return function () {
      done = true;
      stopClock();
      tm.clear();
      asker.release();
      kit.release(offs);
      shell.destroy();
    };
  }

  OwnIt.register({
    id: 'next-tick',
    name: 'Next Tick',
    minutes: 4,
    keys: [['1-4', 'Pick an outcome'], ['Enter', 'Next tick'], ['Esc', 'Leave']],
    howto: HOWTO,
    play: play
  });
})();
