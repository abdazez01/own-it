/* own-it game template: Memory Match (design spec 5d, frontend spec 6.3). Terms and meanings lie face down in a grid. The player flips two
   cards, tap or Enter: a term with its meaning stays up (+10 XP), anything else flips back. The first three mismatches are free,
   each one after costs 2 XP. The pairing arrives obfuscated and is decoded only when a term meets a meaning. Arrows move between
   cards. Builds DOM with OwnIt.el only. */
(function () {
  'use strict';
  var OwnIt = window.OwnIt;
  var kit = OwnIt.kit;
  var XP_PAIR = 10, XP_MISS = 2, FREE_MISSES = 3, BACK_MS = 800;

  function shuffled(list) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1)), t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  function play(root, round, ctx) {
    var terms = (round && round.terms) || [];
    var meanings = (round && round.meanings) || [];
    var total = Math.min(terms.length, meanings.length);
    var exam = (round && round.mode === 'exam') || OwnIt.mode === 'exam';
    var mode = exam ? 'exam' : 'practice';

    var done = false;
    var matched = 0;
    var misses = 0;
    var streak = 0;
    var missedTerms = {};   // term index -> true, for the result card
    var open = [];          // cards face up and not yet decided (0-2)
    var pending = null;     // timer that flips a mismatched pair back
    var cur = 0;            // card that Enter flips

    var shell = OwnIt.shell(root, ctx, { zone: round && round.zone, total: total, side: false });
    var area = shell.area;
    shell.setScore(0, total);
    shell.startTimer();

    var panel = OwnIt.el('section', { 'class': 'panel mm-panel' });
    var status = OwnIt.el('p', { 'class': 'mm-status', 'aria-live': 'polite' });
    var board = OwnIt.el('div', { 'class': 'mm-board', role: 'group', 'aria-label': 'Cards' });
    panel.appendChild(OwnIt.el('p', { 'class': 'wb-intro' }, 'Flip two cards to pair each term with what it means. Tap a card, or move with the arrow keys and press Enter.'));
    panel.appendChild(board);
    panel.appendChild(status);
    area.appendChild(panel);

    var cards = [];
    function describe() {
      var cost = Math.max(0, misses - FREE_MISSES) * XP_MISS;
      status.textContent = matched + ' of ' + total + ' pairs. ' + kit.plural(misses, 'mismatch', 'mismatches') +
        (misses > FREE_MISSES ? ' (-' + cost + ' XP)' : ' (' + Math.max(0, FREE_MISSES - misses) + ' free)') + '.';
    }

    function paint(c) {
      var text = c.kind === 'term' ? terms[c.idx] : meanings[c.idx];
      var showing = c.up || c.matched;
      c.el.textContent = showing ? text : '?';
      c.el.className = 'mm-card ' + c.kind + (c.up ? ' up' : '') + (c.matched ? ' matched' : '');
      c.el.setAttribute('aria-label', 'Card ' + (c.pos + 1) + (showing ? ': ' + text + (c.matched ? ', matched' : '') : ', face down'));
      if (c.matched) c.el.setAttribute('aria-disabled', 'true');
    }

    function build() {
      var all = [];
      for (var i = 0; i < total; i++) {
        all.push({ kind: 'term', idx: i });
        all.push({ kind: 'meaning', idx: i });
      }
      shuffled(all).forEach(function (c, pos) {
        c.pos = pos;
        c.up = false;
        c.matched = false;
        c.el = OwnIt.el('button', { type: 'button', 'data-kind': c.kind, 'data-idx': String(c.idx) });
        c.el.addEventListener('click', function () { cur = pos; flip(c); });
        paint(c);
        cards.push(c);
        board.appendChild(c.el);
      });
    }

    function settle() {
      if (pending) { clearTimeout(pending); pending = null; }
      open.forEach(function (c) { c.up = false; paint(c); });
      open = [];
    }

    function pairing() {
      var map = OwnItCore.decode(round.answer); // the only place the pairing is decoded
      return Array.isArray(map) ? map : [];
    }

    function judge(a, b) {
      var t = a.kind === 'term' ? a : b, m = a.kind === 'term' ? b : a;
      if (a.kind === b.kind) return { ok: false, term: a.kind === 'term' ? a.idx : -1 };
      return { ok: pairing()[t.idx] === m.idx, term: t.idx };
    }

    function flip(c) {
      if (done || c.matched) return;
      if (open.length === 2) settle();
      if (c.up) return;
      c.up = true;
      paint(c);
      open.push(c);
      if (open.length < 2) return;
      var verdict = judge(open[0], open[1]);
      if (verdict.ok) {
        var pair = open;
        open = [];
        pair.forEach(function (p) { p.matched = true; paint(p); });
        matched++;
        streak++;
        if (streak > 1) OwnIt.sound('combo', streak - 1); else OwnIt.sound('correct');
        shell.setScore(matched, total);
        describe();
        if (matched >= total) finish();
        return;
      }
      misses++;
      if (streak > 1) OwnIt.sound('streak-break');
      streak = 0;
      open.forEach(function (p) { if (p.kind === 'term') missedTerms[p.idx] = true; });
      OwnIt.sound('wrong');
      OwnIt.juice.shake(board);
      describe();
      pending = setTimeout(function () { pending = null; if (!done) settle(); }, OwnIt.reduced() ? BACK_MS * 2 : BACK_MS);
    }

    function finish() {
      done = true;
      var cost = Math.max(0, misses - FREE_MISSES) * XP_MISS;
      var missed = Object.keys(missedTerms).sort(function (x, y) { return x - y; });
      var map = missed.length ? pairing() : [];
      var review = missed.map(function (i) {
        return { text: terms[i] + ' means: ' + meanings[map[i]] };
      });
      OwnIt.kit.finish(shell, ctx, { game: 'memory-match', mode: mode, got: matched, of: total, xp: Math.max(0, matched * XP_PAIR - cost), missed: missed, review: review });
    }

    function cols() { return (window.innerWidth || 1024) < 640 ? 2 : 4; }
    function move(delta) {
      if (done || !cards.length) return;
      cur = Math.max(0, Math.min(cards.length - 1, cur + delta));
      cards[cur].el.focus();
    }

    var offs = [];
    [['ArrowRight', 1], ['ArrowLeft', -1], ['ArrowDown', 'row'], ['ArrowUp', '-row']].forEach(function (p) {
      offs.push(ctx.keys.on(p[0], function (e) {
        if (kit.modalOpen() || !kit.mine(e, area)) return;
        if (e && e.preventDefault) e.preventDefault();
        move(p[1] === 'row' ? cols() : p[1] === '-row' ? -cols() : p[1]);
      }));
    });
    offs.push(kit.onActivate(ctx, area, 'Enter', function (e) {
      var at = kit.targetIndex(board.children, e);
      if (at >= 0) cur = at;
      if (cards[cur]) flip(cards[cur]);
    }));

    if (total) {
      build();
      describe();
      if (cards[0].el.focus) cards[0].el.focus();
    } else {
      done = true;
      shell.stopTimer();
      status.textContent = 'This round has no cards. Ask Claude to build a new memory match round, then pick it again from the board.';
    }

    return function () {
      done = true;
      if (pending) { clearTimeout(pending); pending = null; }
      offs.forEach(function (off) { try { off(); } catch (e) { /* gone */ } });
      shell.destroy();
    };
  }

  OwnIt.register({
    id: 'memory-match',
    name: 'Memory Match',
    minutes: 3,
    keys: [['Arrows', 'Move between cards'], ['Enter', 'Flip the card'], ['Esc', 'Leave']],
    play: play
  });
})();
