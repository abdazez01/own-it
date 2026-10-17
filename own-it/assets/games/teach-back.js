/* own-it game template: Teach-back (design spec 5e). The rebuilt screen sits next to a box: "Explain this screen to your product manager
   in two sentences." In live mode the text goes to Claude as an `ask` event (q1) and the game waits for Claude's grade and note, which arrive as
   feedback data (see kit.asker). In file mode nothing can be graded here, so the text goes into the result as text:{q1} for Claude to read in
   chat. Nothing is scored by the page: the rung is none, so only Curiosity XP counts, awarded by apply. Enter sends, Shift+Enter adds a line.
   Builds DOM with OwnIt.el only. */
(function () {
  'use strict';
  var OwnIt = window.OwnIt;
  var kit = OwnIt.kit;
  var KEY = 'q1';
  var LEAD = { solid: 'Clear.', partial: 'Close.', miss: 'Not yet.' };

  function play(root, round, ctx) {
    if (!round || typeof round.screen !== 'string' || !round.screen) throw new Error('This round cannot be played: malformed teach-back round.');
    var exam = round.mode === 'exam' || OwnIt.mode === 'exam';
    var mode = exam ? 'exam' : 'practice';

    var done = false;
    var phase = 'writing';   // writing | waiting | graded
    var typed = '';
    var grade = null;

    var shell = OwnIt.shell(root, ctx, { zone: round.zone, total: 1, side: false });
    var area = shell.area;
    shell.setScore(0, 1);
    shell.startTimer();

    var grid = OwnIt.el('div', { 'class': 'tour-grid' });
    var screenBox = OwnIt.el('section', { 'class': 'tour-screen', 'aria-label': 'Screen copy' });
    var card = OwnIt.el('section', { 'class': 'panel tour-card' });
    var prompt = OwnIt.el('h2', { 'class': 'quiz-q' }, 'Explain this screen to your product manager in two sentences.');
    var box = OwnIt.el('textarea', { 'class': 'boss-answer tb-text', rows: '5', maxlength: '600', 'aria-label': 'Your explanation', placeholder: 'What does a person see here, and what can they do?' });
    var status = OwnIt.el('div', { 'class': 'quiz-feedback', 'aria-live': 'polite' });
    var actions = OwnIt.el('div', { 'class': 'actions quiz-actions' });
    var skipBtn = OwnIt.button('Continue without a grade', 'quiet', null, { 'class': 'btn btn-quiet boss-skip' });
    skipBtn.setAttribute('hidden', 'hidden');
    var sendBtn = OwnIt.button('Send explanation', 'primary', null, { 'class': 'btn btn-primary tb-send' });
    var nextBtn = OwnIt.button('See result', 'primary', null, { 'class': 'btn btn-primary tb-next' });
    nextBtn.setAttribute('hidden', 'hidden');
    [skipBtn, sendBtn, nextBtn].forEach(function (b) { actions.appendChild(b); });
    [prompt, box, status, actions].forEach(function (n) { card.appendChild(n); });
    grid.appendChild(screenBox);
    grid.appendChild(card);
    area.appendChild(grid);

    var host = OwnIt.screenhost.mount(screenBox, round.screen);

    function say(cls, lead, text) { status.textContent = ''; kit.note(status, cls, lead, text); }

    var asker = kit.asker(ctx, {
      onGrade: function (key, g) {
        if (done || phase !== 'waiting') return;
        grade = g;
        phase = 'graded';
        var fb = (OwnIt.feedback ? OwnIt.feedback(ctx.roundId) : null) || ctx.feedback;
        var note = fb && fb.notes && kit.has(fb.notes, key) && typeof fb.notes[key] === 'string' ? fb.notes[key] : '';
        skipBtn.setAttribute('hidden', 'hidden');
        OwnIt.sound(g === 'miss' ? 'press' : 'correct');
        say(g === 'miss' ? 'bad' : 'good', LEAD[g], note || 'Claude explains more in the debrief.');
        showNext();
      },
      onUnsent: function () {
        if (done || phase !== 'waiting') return;
        phase = 'writing';
        box.removeAttribute('disabled');
        sendBtn.removeAttribute('hidden');
        skipBtn.setAttribute('hidden', 'hidden');
        say('bad', "Couldn't reach Claude.", 'Press Send explanation to try again.');
      },
      onSkip: function () { if (phase === 'waiting') skipBtn.removeAttribute('hidden'); },
      onOffline: function () { if (!done && phase === 'waiting') finish(); }
    });

    function showNext() {
      nextBtn.removeAttribute('hidden');
      if (nextBtn.focus) nextBtn.focus();
    }

    function submit() {
      if (done || phase !== 'writing') return;
      var text = String(box.value || '').trim();
      if (!text) { say('bad', 'Write something first.', 'Even one sentence helps.'); return; }
      typed = text;
      box.setAttribute('disabled', 'disabled');
      sendBtn.setAttribute('hidden', 'hidden');
      phase = 'waiting';
      if (asker.send(KEY, text)) say('', 'Sent.', 'Claude is reading your explanation.');
      else finish(); // file mode: the text goes into the result
    }

    function finish() {
      if (done) return;
      done = true;
      asker.cancel();
      var extra = { text: {} };
      extra.text[KEY] = typed;
      if (grade) extra.grades = { q1: grade }; else extra.graded = false;
      kit.finish(shell, ctx, { game: 'teach-back', mode: mode, got: 1, of: 1, xp: 0, missed: [], review: [], extra: extra });
    }

    box.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); e.stopPropagation(); submit(); }
    });
    sendBtn.addEventListener('click', submit);
    nextBtn.addEventListener('click', finish);
    skipBtn.addEventListener('click', function () { if (phase === 'waiting') finish(); });

    var offs = [function () { asker.release(); }];
    offs.push(kit.onActivate(ctx, area, 'Enter', function () { if (phase === 'graded') finish(); }));

    if (box.focus) box.focus();

    return function () {
      done = true;
      kit.release(offs);
      if (host && host.destroy) host.destroy();
      shell.destroy();
    };
  }

  OwnIt.register({
    id: 'teach-back',
    name: 'Teach-back',
    minutes: 3,
    keys: [['Enter', 'Send, or go on'], ['Shift+Enter', 'New line'], ['Esc', 'Leave']],
    play: play
  });
})();
