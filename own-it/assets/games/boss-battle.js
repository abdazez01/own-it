/* own-it game template: Boss Battle (design spec 8.4, frontend spec 6.3). Five typed questions, one at a time. In live mode each answer goes
   to Claude as an `ask` event (q = 'q1'..'q5') and the game waits for Claude's grade to arrive as feedback data
   (window.OWNIT_FEEDBACK[roundId], read when the link reports new data). solid = a hit (boss HP -20, correct sound, damage flap),
   partial = a half hit (-10), miss = a lost life (flag tile, shake, wrong sound). Three lost lives end the fight; so does an empty HP bar
   or the fifth answer. In file mode nothing can be graded here, so the typed answers are collected into the result as text:{q1..q5}
   for Claude to grade in chat. Enter sends, Shift+Enter adds a line. DOM via OwnIt.el only. */
(function () {
  'use strict';
  var OwnIt = window.OwnIt;
  var kit = OwnIt.kit;
  var LIVES = 3;
  var SCORE = { solid: { hit: 20, xp: 20 }, partial: { hit: 10, xp: 10 }, miss: { hit: 0, xp: 0 } };
  var STEP = 20;               // boss HP per tile
  var SKIP_AFTER_MS = 60000;   // waiting this long for Claude offers Skip question
  var FULL = '\u25A0', HALF = '\u2584', EMPTY = '\u25A1';
  var KINDS = {
    why: 'Why this and not that',
    malicious: 'What an attacker tries',
    structure: 'How it is built',
    fails: 'Where it breaks',
    term: 'What the word means'
  };

  var own = kit.has;

  OwnIt.bossGradeFor = kit.gradeFor;

  function play(root, round, ctx) {
    var questions = ((round && round.questions) || []).filter(function (q) { return q && typeof q.q === 'string'; });
    var total = questions.length;
    var exam = (round && round.mode === 'exam') || OwnIt.mode === 'exam';
    var mode = exam ? 'exam' : 'practice';

    var qi = 0;
    var phase = 'answering';   // answering | waiting | graded
    var done = false;
    var hp = 100;
    var lives = LIVES;
    var texts = {};            // q1.. -> typed answer
    var grades = {};           // q1.. -> solid | partial | miss
    var order = [];            // keys in the order they were answered
    var dmgTimer = null;

    var shell = OwnIt.shell(root, ctx, {
      zone: round && round.zone, total: total, side: false,
      hint: exam ? null : function () { return 'Say what the part is for, what could go wrong with it, and why it was built this way.'; }
    });
    shell.setScore(0, total);
    var area = shell.area;
    shell.startTimer();

    // ---- boss bar and lives
    var head = OwnIt.el('section', { 'class': 'panel boss-top' });
    var hpRow = OwnIt.el('div', { 'class': 'flap-label boss-hp-row' });
    hpRow.appendChild(OwnIt.el('span', null, 'Boss'));
    var hpEl = OwnIt.el('span', { 'class': 'boss-hp' });
    hpRow.appendChild(hpEl);
    paintHp();
    var damage = OwnIt.el('span', { 'class': 'boss-damage', 'aria-hidden': 'true' });
    hpRow.appendChild(damage);
    var livesRow = OwnIt.el('div', { 'class': 'flap-label boss-lives-row' });
    livesRow.appendChild(OwnIt.el('span', null, 'Lives'));
    var livesEl = OwnIt.el('span', { 'class': 'flap boss-lives', role: 'img', 'aria-label': LIVES + ' lives left' });
    var flags = [];
    for (var i = 0; i < LIVES; i++) {
      var f = OwnIt.el('span', { 'class': 'flap-tile boss-life', 'aria-hidden': 'true' });
      f.appendChild(OwnIt.icons.svg('flag'));
      flags.push(f);
      livesEl.appendChild(f);
    }
    livesRow.appendChild(livesEl);
    [hpRow, livesRow].forEach(function (n) { head.appendChild(n); });

    // ---- question card
    var card = OwnIt.el('section', { 'class': 'panel boss-card' });
    var dots = kit.dots(total);
    var kindEl = OwnIt.el('p', { 'class': 'boss-kind' });
    var qText = OwnIt.el('h2', { 'class': 'quiz-q', 'aria-live': 'polite' });
    var box = OwnIt.el('textarea', { 'class': 'boss-answer', rows: '5', maxlength: '1200', 'aria-label': 'Your answer', placeholder: 'Type your answer in your own words.' });
    var status = OwnIt.el('div', { 'class': 'quiz-feedback boss-status', 'aria-live': 'polite' });
    var actions = OwnIt.el('div', { 'class': 'actions quiz-actions' });
    var sendBtn = OwnIt.button('Send answer', 'primary', function () { submit(); }, { 'class': 'btn btn-primary boss-send' });
    var nextBtn = OwnIt.button('Next', 'primary', function () { next(); }, { 'class': 'btn btn-primary boss-next' });
    nextBtn.setAttribute('hidden', 'hidden');
    var skipBtn = OwnIt.button('Skip question', 'quiet', function () { skip(); }, { 'class': 'btn btn-quiet boss-skip' });
    skipBtn.setAttribute('hidden', 'hidden');
    actions.appendChild(skipBtn);
    actions.appendChild(sendBtn);
    actions.appendChild(nextBtn);
    [dots.el, kindEl, qText, box, status, actions].forEach(function (n) { card.appendChild(n); });
    area.appendChild(head);
    area.appendChild(card);

    function qk(i) { return 'q' + (i + 1); }
    var asker = kit.asker(ctx, {
      onGrade: function (key, g) { if (!done && phase === 'waiting' && key === qk(qi)) applyGrade(g); },
      onUnsent: unsend,
      onSkip: function () { if (phase === 'waiting') skipBtn.removeAttribute('hidden'); },
      onOffline: function () { if (!done && phase === 'waiting') settleUngraded(); }
    }, SKIP_AFTER_MS);
    // Five tiles, one per 20 HP: full, half (10 left) or empty.
    function paintHp() {
      var glyphs = '';
      for (var t = 0; t < 100 / STEP; t++) {
        var left = hp - t * STEP;
        glyphs += left >= STEP ? FULL : left >= STEP / 2 ? HALF : EMPTY;
      }
      OwnIt.flapSet(hpEl, glyphs);
      hpEl.setAttribute('aria-label', 'Boss HP ' + hp);
    }
    function setHp(next) { hp = Math.max(0, next); paintHp(); }
    function showDamage(n) {
      damage.textContent = '';
      var d = OwnIt.el('span');
      damage.appendChild(d);
      OwnIt.flap(d, '-' + n, { variant: 'alert' });
      if (dmgTimer) clearTimeout(dmgTimer);
      dmgTimer = setTimeout(function () { dmgTimer = null; if (d.remove) d.remove(); }, 1100);
    }
    function loseLife() {
      lives = Math.max(0, lives - 1);
      flags.forEach(function (f, i) { if (i >= lives) f.classList.add('lost'); });
      livesEl.setAttribute('aria-label', lives + (lives === 1 ? ' life left' : ' lives left'));
    }
    function say(cls, lead, text) { status.textContent = ''; kit.note(status, cls, lead, text); }

    function render() {
      phase = 'answering';
      var q = questions[qi];
      kindEl.textContent = own(KINDS, q.kind) ? KINDS[q.kind] : '';
      qText.textContent = q.q;
      box.value = '';
      box.removeAttribute('disabled');
      status.textContent = '';
      sendBtn.removeAttribute('hidden');
      nextBtn.setAttribute('hidden', 'hidden');
      skipBtn.setAttribute('hidden', 'hidden');
      dots.paint(qi, false, 'Question');
      if (box.focus) box.focus();
    }

    function submit() {
      if (done || phase !== 'answering') return;
      var text = String(box.value || '').trim();
      if (!text) { say('bad', 'Type an answer first.', 'Even a guess counts.'); return; }
      var key = qk(qi);
      texts[key] = text;
      box.setAttribute('disabled', 'disabled');
      sendBtn.setAttribute('hidden', 'hidden');
      phase = 'waiting';
      if (asker.send(key, text)) {
        say('', 'Sent.', 'Claude is grading your answer.');
      } else {
        settleUngraded();
      }
    }

    // The ask never reached Claude: put the question back so the same answer can be sent again.
    function unsend() {
      if (done || phase !== 'waiting') return;
      phase = 'answering';
      box.removeAttribute('disabled');
      sendBtn.removeAttribute('hidden');
      say('bad', "Couldn't reach Claude.", 'Press Send answer to try again.');
    }

    // Waiting too long: the player moves on and the question counts as a miss.
    function skip() {
      if (done || phase !== 'waiting') return;
      asker.cancel();
      applyGrade('miss');
    }

    // File mode (or a lost link): the answer is kept for the result and graded by Claude in chat.
    function settleUngraded() {
      phase = 'graded';
      dots.set(qi, 'set');
      dots.paint(qi, true, 'Question');
      say('', 'Saved.', 'Claude grades your answers in the chat.');
      if (qi + 1 >= total) return finish();
      nextBtn.textContent = 'Next';
      nextBtn.removeAttribute('hidden');
      if (nextBtn.focus) nextBtn.focus();
    }

    function applyGrade(g) {
      var key = qk(qi);
      skipBtn.setAttribute('hidden', 'hidden');
      phase = 'graded';
      grades[key] = g;
      order.push(key);
      dots.set(qi, g === 'solid' ? 'ok' : g === 'partial' ? 'set' : 'bad');
      dots.paint(qi, true, 'Question');
      var solid = order.filter(function (k) { return grades[k] === 'solid'; }).length;
      shell.setScore(solid, total);
      if (g === 'miss') {
        loseLife();
        OwnIt.sound('wrong');
        if (OwnIt.juice) OwnIt.juice.shake(area);
        say('bad', 'Not quite.', 'You lose a flag. Claude explains in the debrief.');
      } else {
        setHp(hp - SCORE[g].hit);
        showDamage(SCORE[g].hit);
        OwnIt.sound('correct');
        if (g === 'solid' && OwnIt.juice) OwnIt.juice.confetti(hpEl);
        say('good', g === 'solid' ? 'Solid.' : 'Partly right.', g === 'solid' ? 'A clean hit on the boss.' : 'Half a hit. The boss is still standing.');
      }
      if (hp <= 0 || lives <= 0 || qi + 1 >= total) return finish();
      nextBtn.textContent = 'Next';
      nextBtn.removeAttribute('hidden');
      if (nextBtn.focus) nextBtn.focus();
    }

    function next() {
      if (done || phase !== 'graded' || qi + 1 >= total) return;
      qi++;
      render();
    }

    function finish() {
      if (done) return;
      done = true;
      var graded = order.length > 0;
      var solid = order.filter(function (k) { return grades[k] === 'solid'; }).length;
      var xp = 0;
      var review = [];
      order.forEach(function (k) {
        xp += SCORE[grades[k]].xp;
        if (grades[k] !== 'solid') {
          var n = parseInt(k.slice(1), 10);
          review.push({ id: k, text: 'Question ' + n + ': ' + questions[n - 1].q + ' Graded: ' + grades[k] + '.' });
        }
      });
      var extra = { text: texts };
      if (graded) extra.grades = grades;
      else extra.graded = false;
      kit.finish(shell, ctx, {
        game: 'boss-battle', mode: mode, got: solid, of: total, xp: xp,
        missed: order.filter(function (k) { return grades[k] !== 'solid'; }), review: review, extra: extra
      });
    }

    box.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); e.stopPropagation(); submit(); }
    });

    var offs = [function () { asker.release(); }];
    offs.push(kit.onActivate(ctx, area, 'Enter', function () {
      if (phase === 'graded' && !nextBtn.hasAttribute('hidden')) next();
    }));

    if (total) render();
    else {
      done = true;
      shell.stopTimer();
      qText.textContent = 'This round has no questions.';
      box.setAttribute('hidden', 'hidden');
      actions.setAttribute('hidden', 'hidden');
      card.appendChild(OwnIt.el('p', { 'class': 'quiz-why' }, 'Ask Claude to build a new boss round, then pick it again from the board.'));
    }

    return function () {
      done = true;
      if (dmgTimer) { clearTimeout(dmgTimer); dmgTimer = null; }
      offs.forEach(function (off) { try { off(); } catch (e) { /* gone */ } });
      shell.destroy();
    };
  }

  OwnIt.register({
    id: 'boss-battle',
    name: 'Boss Battle',
    minutes: 6,
    keys: [['Enter', 'Send answer or go on'], ['Shift+Enter', 'New line'], ['H', 'Hint (costs 15 XP)'], ['Esc', 'Leave']],
    play: play
  });
})();
