/* own-it game template: What-If Dial (design spec 5e). A few dials, each a what-if: the load grows or a timeout shrinks. The player turns the
   dial (left and right arrows, keys 1-4, or a tap) to the part they think fails first, then locks it in with Enter or the button. A right call
   is worth 10 XP. The reveal runs a cascade: the part that fails first drops, then the rest follow, and the reason shows. The answer and the
   reason arrive obfuscated and are decoded only when a dial is locked. Builds DOM with OwnIt.el only. */
(function () {
  'use strict';
  var OwnIt = window.OwnIt;
  var kit = OwnIt.kit;
  var XP_EACH = 10, CASCADE_MS = 220, NEEDLE_SPAN = 40;

  function play(root, round, ctx) {
    var dials = (round && round.dials) || [];
    var validDial = function (d) {
      return d && typeof d.label === 'string' && Array.isArray(d.options) && d.options.length >= 2 && d.options.every(function (o) { return typeof o === 'string'; }) &&
        typeof d.answer === 'string' && typeof d.why === 'string';
    };
    if (!Array.isArray(dials) || !dials.length || !dials.every(validDial)) throw new Error('This round cannot be played: malformed what-if round.');
    var total = dials.length;
    var exam = (round && round.mode === 'exam') || OwnIt.mode === 'exam';
    var mode = exam ? 'exam' : 'practice';

    var done = false;
    var at = 0;             // dial being turned
    var pos = 0;            // option the dial points at
    var locked = false;
    var right = 0;
    var streak = 0;
    var wrong = [];         // dial positions judged wrong
    var review = [];
    var tm = kit.timers();

    var shell = OwnIt.shell(root, ctx, { zone: round && round.zone, total: total, side: false });
    var area = shell.area;
    shell.setScore(0, total);
    shell.startTimer();

    var panel = OwnIt.el('section', { 'class': 'panel wi-panel' });
    var meter = OwnIt.el('p', { 'class': 'wa-meter', 'aria-live': 'polite' });
    var question = OwnIt.el('h2', { 'class': 'quiz-q' });
    var knob = OwnIt.el('div', { 'class': 'wi-knob', 'aria-hidden': 'true' });
    var needle = OwnIt.el('span', { 'class': 'wi-needle' });
    knob.appendChild(needle);
    var row = OwnIt.el('div', { 'class': 'wi-opts', role: 'radiogroup', 'aria-label': 'What fails first' });
    var actions = OwnIt.el('div', { 'class': 'actions' });
    var lockBtn = OwnIt.button('Lock in', 'primary', null);
    lockBtn.classList.add('wi-lock');
    var nextBtn = OwnIt.button('Next', 'primary', null);
    nextBtn.classList.add('wi-next');
    nextBtn.setAttribute('hidden', 'hidden');
    actions.appendChild(lockBtn);
    actions.appendChild(nextBtn);
    var feedback = OwnIt.el('div', { 'class': 'quiz-feedback', 'aria-live': 'polite' });
    panel.appendChild(OwnIt.el('p', { 'class': 'wb-intro' }, 'Turn the dial to what fails first. Use the left and right arrows, the keys 1 to 4, or tap. Press Enter to lock in.'));
    [meter, question, knob, row, actions, feedback].forEach(function (x) { panel.appendChild(x); });
    area.appendChild(panel);

    var opts = [];

    function aim(i) {
      pos = i;
      opts.forEach(function (b, k) {
        b.setAttribute('aria-checked', k === i ? 'true' : 'false');
        if (k === i) b.classList.add('on'); else b.classList.remove('on');
        b.setAttribute('tabindex', k === i ? '0' : '-1');
      });
      var n = dials[at].options.length;
      needle.style.transform = 'rotate(' + Math.round((i - (n - 1) / 2) * NEEDLE_SPAN) + 'deg)';
    }

    function show() {
      var d = dials[at];
      locked = false;
      meter.textContent = 'Dial ' + (at + 1) + ' of ' + total + '. ' + right + ' right so far.';
      question.textContent = d.label;
      feedback.textContent = '';
      row.textContent = '';
      opts = d.options.map(function (text, i) {
        var b = OwnIt.el('button', { type: 'button', 'class': 'wi-opt', role: 'radio', 'aria-checked': 'false' });
        b.appendChild(OwnIt.el('span', { 'class': 'answer-key', 'aria-hidden': 'true' }, String(i + 1)));
        b.appendChild(OwnIt.el('span', { 'class': 'answer-text' }, text));
        b.addEventListener('click', function () { if (locked) return; if (pos === i) lock(); else turnTo(i); });
        row.appendChild(b);
        return b;
      });
      lockBtn.removeAttribute('hidden');
      nextBtn.setAttribute('hidden', 'hidden');
      aim(0);
      if (opts[0].focus) opts[0].focus();
    }

    function turnTo(i) {
      if (done || locked || i < 0 || i >= opts.length) return;
      aim(i);
      OwnIt.sound('press');
      if (opts[i].focus) opts[i].focus();
    }

    function turn(step) {
      var n = opts.length;
      turnTo(((pos + step) % n + n) % n);
    }

    function lock() {
      if (done || locked) return;
      locked = true;
      var d = dials[at];
      var truth = OwnItCore.decode(d.answer); // the only place a dial's answer is decoded
      var why = OwnItCore.decode(d.why);
      var ok = truth === pos;
      var firstName = d.options[truth] === undefined ? '' : d.options[truth];
      var reason = String(why || '');
      lockBtn.setAttribute('hidden', 'hidden');
      opts.forEach(function (b) { b.setAttribute('aria-disabled', 'true'); });
      if (opts[truth]) opts[truth].classList.add('first');
      // Cascade: the part that fails first drops, then the rest follow in the order they sit.
      var rest = opts.map(function (b, k) { return k; }).filter(function (k) { return k !== truth; });
      var drop = function (k) { opts[k].classList.add('fell'); };
      if (opts[truth]) drop(truth);
      rest.forEach(function (k, j) { if (OwnIt.reduced()) drop(k); else tm.later(function () { drop(k); }, (j + 1) * CASCADE_MS); });
      if (ok) {
        right++;
        streak++;
        OwnIt.sound('combo', streak);
        shell.setScore(right, total);
        feedback.appendChild(OwnIt.el('p', { 'class': 'quiz-xp' }, '+' + XP_EACH + ' XP'));
        kit.note(feedback, 'good', 'Right.', firstName + ' fails first. ' + reason);
      } else {
        if (streak > 1) OwnIt.sound('streak-break');
        streak = 0;
        wrong.push(at);
        review.push({ text: d.label + ' ' + firstName + ' fails first. ' + reason });
        OwnIt.sound('wrong');
        OwnIt.juice.shake(row);
        kit.note(feedback, 'bad', 'Not quite.', firstName + ' fails first. ' + reason);
      }
      kit.nextLabel(nextBtn, at, total);
    }

    function next() {
      if (done || !locked) return;
      at++;
      if (at >= total) return finish();
      show();
    }

    function finish() {
      if (done) return;
      done = true;
      tm.clear();
      if (right >= total) { OwnIt.sound('correct'); OwnIt.juice.confetti(panel); }
      kit.finish(shell, ctx, { game: 'what-if', mode: mode, got: right, of: total, xp: right * XP_EACH,
        missed: wrong.map(String), review: review });
    }

    lockBtn.addEventListener('click', lock);
    nextBtn.addEventListener('click', next);

    var offs = kit.arrowKeys(ctx, area, function (dx, dy) { if (!done) turn(dx + dy); });
    kit.choiceKeys(ctx, function (i) { if (!done) turnTo(i); }).forEach(function (off) { offs.push(off); });
    offs.push(kit.onActivate(ctx, area, 'Enter', function () { if (locked) next(); else lock(); }));

    show();

    return function () {
      done = true;
      tm.clear();
      kit.release(offs);
      shell.destroy();
    };
  }


  // Guided practice on a made-up dial (not from the app): pick the part that fails first, then lock it in.
  var tutorial = {
    title: 'How to play What-If Dial',
    board: function (host) {
      var nodes = {};
      host.appendChild(OwnIt.el('p', { 'class': 'quiz-q' }, 'What if ten times more riders open the app at once? What fails first?'));
      var row = OwnIt.el('div', { 'class': 'wi-opts', role: 'group', 'aria-label': 'Practice choices' });
      [['web', 'The web page'], ['db', 'The database'], ['cache', 'The cache']].forEach(function (o, i) {
        var b = OwnIt.el('button', { type: 'button', 'class': 'wi-opt' });
        b.appendChild(OwnIt.el('span', { 'class': 'answer-key', 'aria-hidden': 'true' }, String(i + 1)));
        b.appendChild(OwnIt.el('span', { 'class': 'answer-text' }, o[1]));
        row.appendChild(b);
        nodes[o[0]] = b;
      });
      host.appendChild(row);
      var lock = OwnIt.button('Lock in', 'primary', null);
      host.appendChild(lock);
      nodes.lock = lock;
      var why = OwnIt.el('p', { 'class': 'quiz-why', hidden: 'hidden' }, 'The database does the most work for every rider, so it runs out of room first.');
      host.appendChild(why);
      nodes._why = why;
      return nodes;
    },
    steps: [
      { title: '1. Turn the dial', text: 'Each dial is a what-if. Point it at the part you think fails first. For this practice, pick the database.', targets: ['db'],
        nudges: { web: 'A web page is cheap to serve. For this practice, pick the database.', cache: 'The cache is built for load. For this practice, pick the database.' } },
      { title: '2. Lock it in', text: 'Press Lock in to commit. In the real game Enter does the same, and the reason shows after.', targets: ['lock'],
        onDone: function (nodes) { nodes._why.removeAttribute('hidden'); } },
      { title: 'Reason shown', text: 'A right call is worth 10 XP. Arrow keys turn the dial, and keys 1 to 4 pick an option.' }
    ]
  };

  OwnIt.register({
    id: 'what-if',
    name: 'What-If Dial',
    minutes: 3,
    keys: [['Left and Right', 'Turn the dial'], ['1-4', 'Point at a choice'], ['Enter', 'Lock in, then move on'], ['Esc', 'Leave']],
    tutorial: tutorial,
    play: play
  });
})();
