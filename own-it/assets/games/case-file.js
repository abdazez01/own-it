/* own-it game template: Case File (design spec 5f). A bug report arrives as a detective case. Four steps: pick the 3 clues that matter from the
   evidence cards (5 XP each; keys 1-6 toggle, Enter locks them in), accuse the guilty part from the suspects (10 XP; click or keys A-E), then
   write the motive, a short "why it breaks". The motive goes to Claude as an `ask` event (q1) and is graded solid/shaky/blind in chat (20/10/0 XP,
   see kit.asker); in file mode the text goes into the result for Claude to read. Then the case closes: the verdict, the evidence chain, the
   culprit's real file:line and the why for every clue. Which clues matter, the culprit, the why and the ref arrive obfuscated and are decoded
   only on a player action (a lock, an accusation, a hint, the end). Impossible adds a 90 s clock for clues and accusation and turns hints off.
   Builds DOM with OwnIt.el only. */
(function () {
  'use strict';
  var OwnIt = window.OwnIt;
  var kit = OwnIt.kit;
  var XP_CLUE = 5, XP_ACCUSE = 10, MOTIVE_XP = { solid: 20, partial: 10, miss: 0 }, CLOCK_MS = 90000, PICKS = 3, KEY = 'q1';
  var LEAD = { solid: 'Solid.', partial: 'Shaky.', miss: 'Blind.' };
  var LETTERS = ['a', 'b', 'c', 'd', 'e'];
  var STEPS = ['Clues', 'Accuse', 'Motive', 'Closed'];

  function play(root, round, ctx) {
    var evidence = (round && round.evidence) || [];
    var suspects = (round && round.suspects) || [];
    var okEvidence = Array.isArray(evidence) && evidence.length >= 4 && evidence.length <= 6 && evidence.every(function (e) { return e && typeof e.text === 'string' && typeof e.answer === 'string' && typeof e.why === 'string'; });
    var okSuspects = Array.isArray(suspects) && suspects.length >= 2 && suspects.length <= 5 && suspects.every(function (s) { return s && typeof s.id === 'string' && typeof s.label === 'string'; });
    if (!round || typeof round.report !== 'string' || !okEvidence || !okSuspects || typeof round.answer !== 'string' || typeof round.why !== 'string' || typeof round.where !== 'string') {
      throw new Error('This round cannot be played: malformed case file round.');
    }
    var exam = round.mode === 'exam' || OwnIt.mode === 'exam';
    var mode = exam ? 'exam' : 'practice';
    var timed = OwnIt.level(ctx.roundId) === 'impossible';
    var byId = {};
    suspects.forEach(function (s) { byId[s.id] = s; });

    var relevant = evidence.map(function (e) { return kit.lazy(e.answer); });   // each card's relevance, decoded on a lock or a hint
    var culprit = kit.lazy(round.answer);                                        // decoded on the accusation or at the end
    var whyText = kit.lazy(round.why);
    var refText = kit.lazy(round.where);                                         // the real file:line, decoded only when the case closes

    var done = false;
    var phase = 'clues';          // clues | accuse | motive | closed
    var picked = evidence.map(function () { return false; });
    var cluesRight = 0;
    var accused = null;           // the suspect id the player named
    var accuseOk = false;
    var typed = '';
    var grade = null;
    var motivePhase = 'writing';  // writing | waiting | skipped | graded
    var curClue = 0, curSus = 0;
    var tm = kit.timers();
    var clock = null;

    var shell = OwnIt.shell(root, ctx, { zone: round.zone, total: 4, side: false,
      hint: exam || timed ? null : function () {
        if (phase !== 'clues') return 'Ask which part the real clues keep pointing at.';
        for (var i = 0; i < evidence.length; i++) {
          if (!picked[i] && relevant[i]()) { clueEls[i].classList.add('hinted'); return 'Look closely at clue ' + (i + 1) + '. It matters.'; }
        }
        return 'You already hold the clues that matter. Check the other cards.';
      } });
    var area = shell.area;
    shell.setScore(0, 4);
    shell.startTimer();

    // ---- layout
    var panel = OwnIt.el('section', { 'class': 'panel cf-panel' });
    var head = OwnIt.el('div', { 'class': 'cf-head' });
    head.appendChild(OwnIt.el('p', { 'class': 'cf-tag' }, 'Case file'));
    head.appendChild(OwnIt.el('h2', { 'class': 'quiz-q cf-report' }, round.report));
    var steps = OwnIt.el('ol', { 'class': 'cf-steps', 'aria-label': 'Case progress' });
    var stepEls = STEPS.map(function (name, i) {
      var li = OwnIt.el('li', { 'class': 'cf-step' });
      li.appendChild(OwnIt.el('span', { 'class': 'cf-step-num', 'aria-hidden': 'true' }, String(i + 1)));
      li.appendChild(OwnIt.el('span', null, name));
      steps.appendChild(li);
      return li;
    });
    var how = OwnIt.el('p', { 'class': 'cf-how' }, 'How to play: pick the 3 clues that matter (keys 1 to ' + evidence.length + '), then press Enter. Accuse one suspect (keys A to ' + LETTERS[suspects.length - 1].toUpperCase() + '). Then say why it breaks.');
    [head, steps, how].forEach(function (n) { panel.appendChild(n); });
    if (timed) clock = kit.clock(panel, CLOCK_MS, { label: 'Seconds left on the case', onEnd: timeUp });

    var body = OwnIt.el('div', { 'class': 'cf-body' });
    var left = OwnIt.el('section', { 'class': 'cf-left', 'aria-label': 'Evidence' });
    var right = OwnIt.el('section', { 'class': 'cf-right', 'aria-label': 'Case actions' });
    left.appendChild(OwnIt.el('h3', { 'class': 'cf-h' }, 'Evidence'));
    var clueNote = OwnIt.el('p', { 'class': 'cf-note' }, 'Tap the 3 cards that explain the report. The rest are red herrings.');
    var clueBox = OwnIt.el('div', { 'class': 'cf-clues', role: 'group', 'aria-label': 'Evidence cards' });
    left.appendChild(clueNote);
    left.appendChild(clueBox);

    var clueEls = evidence.map(function (e, i) {
      var b = OwnIt.el('button', { type: 'button', 'class': 'cf-clue', 'aria-pressed': 'false' });
      b.appendChild(OwnIt.el('span', { 'class': 'cf-key', 'aria-hidden': 'true' }, String(i + 1)));
      b.appendChild(OwnIt.el('span', { 'class': 'cf-clue-text' }, e.text));
      b.appendChild(OwnIt.el('span', { 'class': 'cf-clue-tag', hidden: 'hidden' }));
      b.appendChild(OwnIt.el('span', { 'class': 'cf-clue-why', hidden: 'hidden' }));
      b.addEventListener('click', function () { curClue = i; toggle(i); });
      clueBox.appendChild(b);
      return b;
    });

    var lockRow = OwnIt.el('div', { 'class': 'cf-lock' });
    var lockBtn = OwnIt.button('Lock in clues', 'primary', null, { 'class': 'btn btn-primary cf-lock-btn' });
    var count = OwnIt.el('span', { 'class': 'cf-count', 'aria-live': 'polite' });
    lockRow.appendChild(lockBtn);
    lockRow.appendChild(count);

    var accuseBox = OwnIt.el('div', { 'class': 'cf-accuse', hidden: 'hidden' });
    accuseBox.appendChild(OwnIt.el('h3', { 'class': 'cf-h' }, 'Who did it?'));
    var susList = OwnIt.el('div', { 'class': 'cf-suspects', role: 'group', 'aria-label': 'Suspects' });
    var susEls = suspects.map(function (s, j) {
      var b = OwnIt.el('button', { type: 'button', 'class': 'cf-suspect' });
      b.appendChild(OwnIt.el('span', { 'class': 'cf-key', 'aria-hidden': 'true' }, LETTERS[j].toUpperCase()));
      b.appendChild(OwnIt.el('span', { 'class': 'cf-sus-text' }, s.label));
      b.addEventListener('click', function () { curSus = j; accuse(j); });
      susList.appendChild(b);
      return b;
    });
    accuseBox.appendChild(susList);

    var motiveBox = OwnIt.el('div', { 'class': 'cf-motive', hidden: 'hidden' });
    motiveBox.appendChild(OwnIt.el('h3', { 'class': 'cf-h' }, 'Motive'));
    motiveBox.appendChild(OwnIt.el('p', { 'class': 'cf-note' }, 'In a sentence or two, why does it break?'));
    var box = OwnIt.el('textarea', { 'class': 'boss-answer cf-text', rows: '4', maxlength: '500', 'aria-label': 'Why it breaks', placeholder: 'It breaks because...' });
    var motiveStatus = OwnIt.el('div', { 'class': 'quiz-feedback', 'aria-live': 'polite' });
    var motiveActions = OwnIt.el('div', { 'class': 'actions quiz-actions' });
    var skipBtn = OwnIt.button('Skip motive', 'quiet', null, { 'class': 'btn btn-quiet cf-skip' });
    var sendBtn = OwnIt.button('Send motive', 'primary', null, { 'class': 'btn btn-primary cf-send' });
    [skipBtn, sendBtn].forEach(function (b) { motiveActions.appendChild(b); });
    [box, motiveStatus, motiveActions].forEach(function (n) { motiveBox.appendChild(n); });

    var closedBox = OwnIt.el('div', { 'class': 'cf-closed', hidden: 'hidden', 'aria-live': 'polite' });
    var live = OwnIt.el('p', { 'class': 'cf-live quiz-why', 'aria-live': 'polite' }, 'Tap a card, or press 1 to ' + evidence.length + '.');

    [lockRow, accuseBox, motiveBox, closedBox, live].forEach(function (n) { right.appendChild(n); });
    body.appendChild(left);
    body.appendChild(right);
    panel.appendChild(body);
    area.appendChild(panel);

    // ---- steps and clues
    function setStep(name) {
      phase = name;
      var at = STEPS.map(function (s) { return s.toLowerCase(); }).indexOf(name);
      stepEls.forEach(function (li, i) {
        li.className = 'cf-step' + (i < at ? ' past' : '') + (i === at ? ' now' : '');
        if (i === at) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
      });
    }
    function say(text) { live.textContent = text; }
    function picks() { return picked.filter(Boolean).length; }

    function paintClues() {
      clueEls.forEach(function (b, i) {
        if (picked[i]) b.classList.add('on'); else b.classList.remove('on');
        b.setAttribute('aria-pressed', picked[i] ? 'true' : 'false');
      });
      var n = picks();
      count.textContent = n + ' of ' + PICKS + ' chosen';
      lockBtn.setAttribute('aria-disabled', n === PICKS ? 'false' : 'true');
    }

    function toggle(i) {
      if (done || phase !== 'clues' || i < 0 || i >= evidence.length) return;
      if (!picked[i] && picks() >= PICKS) {
        OwnIt.sound('wrong');
        say('Three clues is the limit. Put one back first.');
        return;
      }
      picked[i] = !picked[i];
      clueEls[i].classList.remove('hinted');
      OwnIt.sound('press');
      paintClues();
      say(picks() === PICKS ? 'Three chosen. Press Enter to lock them in.' : 'Pick ' + (PICKS - picks()) + ' more.');
    }

    function tag(i, cls, text) {
      var t = clueEls[i].children[2];
      clueEls[i].classList.add(cls);
      t.textContent = text;
      t.removeAttribute('hidden');
    }

    function lock() {
      if (done || phase !== 'clues') return;
      if (picks() !== PICKS) {
        OwnIt.sound('wrong');
        say('Pick exactly ' + PICKS + ' clues first.');
        return;
      }
      closeClues();
    }

    // Scores the clues as they stand (the clock may run out on fewer than three) and shows which cards were the real evidence.
    function closeClues() {
      var streak = 0;
      evidence.forEach(function (e, i) {
        var real = relevant[i]();
        if (picked[i] && real) { cluesRight++; streak++; tag(i, 'right', 'Real clue'); OwnIt.sound('combo', streak); }
        else if (picked[i]) { streak = 0; tag(i, 'herring', 'Red herring'); }
        else if (real) tag(i, 'missed', 'You missed this one');
        clueEls[i].setAttribute('aria-disabled', 'true');
        clueEls[i].classList.remove('hinted');
      });
      if (cluesRight < picks()) { OwnIt.sound('wrong'); OwnIt.juice.shake(clueBox); }
      shell.setScore(cluesRight, 4);
      lockRow.setAttribute('hidden', 'hidden');
      clueNote.textContent = 'The marked cards are the real evidence.';
      accuseBox.removeAttribute('hidden');
      setStep('accuse');
      say(cluesRight === PICKS ? 'All three clues are real. Now accuse a suspect, or press A to ' + LETTERS[suspects.length - 1].toUpperCase() + '.'
        : cluesRight + ' of ' + PICKS + ' clues were real. Use the marked cards, then accuse a suspect.');
    }

    // ---- accusation
    function accuse(j) {
      if (done || phase !== 'accuse' || j < 0 || j >= suspects.length) return;
      accused = suspects[j].id;
      accuseOk = accused === culprit();
      susEls.forEach(function (b, k) { b.setAttribute('aria-disabled', 'true'); if (k === j) b.classList.add(accuseOk ? 'right' : 'wrong'); });
      if (accuseOk) {
        OwnIt.sound('correct');
        shell.setScore(cluesRight + 1, 4);
        say('That is the one.');
      } else {
        OwnIt.sound('wrong');
        OwnIt.juice.shake(susList);
        say('Not that part. The case is not closed yet.');
      }
      startMotive();
    }

    // ---- motive
    function startMotive() {
      if (clock) clock.stop();
      setStep('motive');
      motiveBox.removeAttribute('hidden');
      if (box.focus) box.focus();
    }

    function motiveSay(cls, lead, text) { motiveStatus.textContent = ''; kit.note(motiveStatus, cls, lead, text); }

    var asker = kit.asker(ctx, {
      onGrade: function (key, g) {
        if (done || motivePhase !== 'waiting') return;
        grade = g;
        motivePhase = 'graded';
        OwnIt.sound(g === 'miss' ? 'press' : 'correct');
        showClosed();
      },
      onUnsent: function () {
        if (done || motivePhase !== 'waiting') return;
        motivePhase = 'writing';
        box.removeAttribute('disabled');
        sendBtn.removeAttribute('hidden');
        skipBtn.removeAttribute('hidden');
        motiveSay('bad', "Couldn't reach Claude.", 'Press Send motive to try again.');
      },
      onSkip: function () { if (motivePhase === 'waiting') { skipBtn.removeAttribute('hidden'); skipBtn.textContent = 'Continue without a grade'; } },
      onOffline: function () { if (!done && motivePhase === 'waiting') showClosed(); }
    });

    function submitMotive() {
      if (done || phase !== 'motive' || motivePhase !== 'writing') return;
      var text = String(box.value || '').trim();
      if (!text) { motiveSay('bad', 'Write something first.', 'Even one sentence helps.'); return; }
      typed = text;
      box.setAttribute('disabled', 'disabled');
      sendBtn.setAttribute('hidden', 'hidden');
      skipBtn.setAttribute('hidden', 'hidden');
      motivePhase = 'waiting';
      if (asker.send(KEY, text)) motiveSay('', 'Sent.', 'Claude is reading your motive.');
      else showClosed(); // file mode: the text goes into the result
    }

    function skipMotive() {
      if (done || phase !== 'motive') return;
      if (motivePhase === 'writing') { motivePhase = 'skipped'; typed = ''; }
      asker.cancel();
      showClosed();
    }

    // ---- the case closes
    function line(parent, cls, lead, text) {
      var p = OwnIt.el('p', { 'class': cls });
      if (lead) p.appendChild(OwnIt.el('strong', null, lead + ' '));
      p.appendChild(OwnIt.el('span', null, text));
      parent.appendChild(p);
      return p;
    }

    function showClosed() {
      if (done || phase === 'closed') return;
      asker.cancel();
      setStep('closed');
      motiveBox.setAttribute('hidden', 'hidden');
      lockRow.setAttribute('hidden', 'hidden');
      accuseBox.setAttribute('hidden', 'hidden');
      var real = culprit(), name = byId[real] ? byId[real].label : kit.label(real, round.labels);
      evidence.forEach(function (e, i) {
        var why = clueEls[i].children[3];
        why.textContent = OwnItCore.decode(e.why);
        why.removeAttribute('hidden');
        var t = clueEls[i].children[2];
        if (t.hasAttribute('hidden')) { t.textContent = 'Red herring'; t.removeAttribute('hidden'); clueEls[i].classList.add('idle'); }
        clueEls[i].setAttribute('aria-disabled', 'true');
      });
      clueNote.textContent = 'Every card, explained.';

      closedBox.textContent = '';
      closedBox.appendChild(OwnIt.el('h3', { 'class': 'cf-h cf-verdict-h' }, 'Case closed'));
      var verdict = line(closedBox, 'cf-verdict ' + (accuseOk ? 'good' : 'bad'), accuseOk ? 'Right suspect.' : 'Wrong suspect.',
        accuseOk ? name + ' is the guilty part.' : 'You named ' + (byId[accused] ? byId[accused].label : 'nobody') + '. The guilty part is ' + name + '.');
      verdict.setAttribute('role', 'status');
      var where = OwnIt.el('p', { 'class': 'cf-where' });
      where.appendChild(OwnIt.el('span', { 'class': 'cf-where-cap' }, 'Where this lives in your code'));
      where.appendChild(OwnIt.el('code', { 'class': 'cf-ref' }, refText()));
      closedBox.appendChild(where);
      line(closedBox, 'cf-why', 'Why it breaks.', whyText());
      var chain = OwnIt.el('ol', { 'class': 'cf-chain', 'aria-label': 'Evidence chain' });
      evidence.forEach(function (e, i) {
        if (!relevant[i]()) return;
        var li = OwnIt.el('li', { 'class': 'cf-link' });
        li.appendChild(OwnIt.el('strong', null, 'Clue ' + (i + 1) + '. '));
        li.appendChild(OwnIt.el('span', null, e.text));
        chain.appendChild(li);
      });
      var end = OwnIt.el('li', { 'class': 'cf-link cf-link-end' });
      end.appendChild(OwnIt.el('strong', null, 'Culprit. '));
      end.appendChild(OwnIt.el('span', null, name));
      chain.appendChild(end);
      closedBox.appendChild(OwnIt.el('h4', { 'class': 'cf-sub' }, 'Evidence chain'));
      closedBox.appendChild(chain);
      if (grade) {
        var fb = (OwnIt.feedback ? OwnIt.feedback(ctx.roundId) : null) || ctx.feedback;
        var note = fb && fb.notes && kit.has(fb.notes, KEY) && typeof fb.notes[KEY] === 'string' ? fb.notes[KEY] : '';
        line(closedBox, 'cf-motive-grade ' + (grade === 'miss' ? 'bad' : 'good'), 'Motive: ' + LEAD[grade], note || 'Claude explains more in the debrief.');
      } else if (typed) line(closedBox, 'cf-motive-grade', 'Motive sent.', 'Claude will read it in chat.');
      else line(closedBox, 'cf-motive-grade', 'Motive skipped.', 'No motive, no motive points.');
      var actions = OwnIt.el('div', { 'class': 'actions quiz-actions' });
      var next = OwnIt.button('See result', 'primary', null, { 'class': 'btn btn-primary cf-next' });
      next.addEventListener('click', finish);
      actions.appendChild(next);
      closedBox.appendChild(actions);
      closedBox.removeAttribute('hidden');
      say('');
      if (accuseOk) { OwnIt.sound(cluesRight === PICKS ? 'levelup' : 'correct'); OwnIt.juice.confetti(panel); }
      if (next.focus) next.focus();
    }

    function timeUp() {
      if (done || phase === 'motive' || phase === 'closed') return;
      OwnIt.sound('wrong');
      if (phase === 'clues') closeClues();
      accused = null;
      accuseOk = false;
      motivePhase = 'skipped';
      showClosed();
    }

    function finish() {
      if (done || phase !== 'closed') return;
      done = true;
      if (clock) clock.stop();
      asker.cancel();
      var real = culprit();
      var review = [];
      evidence.forEach(function (e, i) {
        var yes = relevant[i](), why = OwnItCore.decode(e.why);
        if (picked[i] && !yes) review.push({ text: 'Red herring: ' + e.text + ' ' + why });
        else if (!picked[i] && yes) review.push({ text: 'You missed this clue: ' + e.text + ' ' + why });
      });
      if (!accuseOk) review.push({ text: 'The guilty part was ' + (byId[real] ? byId[real].label : real) + ' (' + refText() + '). ' + whyText() });
      var extra = { text: {}, wrong: accuseOk || !accused ? [] : [[accused, real]] };
      if (typed) extra.text[KEY] = typed;
      if (grade) extra.grades = { q1: grade }; else if (typed) extra.graded = false;
      var xp = cluesRight * XP_CLUE + (accuseOk ? XP_ACCUSE : 0) + (grade ? MOTIVE_XP[grade] : 0);
      kit.finish(shell, ctx, { game: 'case-file', mode: mode, got: cluesRight + (accuseOk ? 1 : 0), of: 4, xp: xp,
        missed: accuseOk ? [] : [real], review: review, extra: extra });
    }

    // ---- wiring
    lockBtn.addEventListener('click', lock);
    sendBtn.addEventListener('click', submitMotive);
    skipBtn.addEventListener('click', skipMotive);
    box.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); e.stopPropagation(); submitMotive(); }
    });

    var offs = [function () { asker.release(); }];
    evidence.forEach(function (e, i) {
      offs.push(ctx.keys.on(String(i + 1), function () { if (!kit.modalOpen()) { curClue = i; toggle(i); } }));
    });
    suspects.forEach(function (s, j) {
      offs.push(ctx.keys.on(LETTERS[j], function () { if (!kit.modalOpen()) { curSus = j; accuse(j); } }));
    });
    offs = offs.concat(kit.arrowKeys(ctx, area, function (dx, dy) {
      if (done) return;
      if (phase === 'clues') { curClue = kit.gridMove(curClue, evidence.length, 2, dx, dy); clueEls[curClue].focus(); }
      else if (phase === 'accuse') { curSus = kit.gridMove(curSus, suspects.length, 1, 0, dy || dx); susEls[curSus].focus(); }
    }));
    offs.push(kit.onActivate(ctx, area, 'Enter', function (e) {
      if (phase === 'clues') lock();
      else if (phase === 'accuse') { var s = kit.targetIndex(susEls, e); if (s >= 0) accuse(s); }
      else if (phase === 'motive') { if (box.focus && motivePhase === 'writing') box.focus(); }
      else if (phase === 'closed') finish();
    }));

    paintClues();
    if (clueEls[0].focus) clueEls[0].focus();

    return function () {
      done = true;
      tm.clear();
      if (clock) clock.stop();
      kit.release(offs);
      shell.destroy();
    };
  }

  OwnIt.register({
    id: 'case-file',
    name: 'Case File',
    minutes: 5,
    keys: [['1-6', 'Toggle a clue'], ['Enter', 'Lock in clues, then see the result'], ['A-E', 'Accuse a suspect'], ['Arrows', 'Move between choices'], ['Esc', 'Leave']],
    play: play
  });
})();
