/* own-it game template: Pipe Plumber (design spec 5e). A request travels from the button that starts it to the data store that keeps it.
   The grid holds one tile per step of that flow plus a few spare pipes. Tiles lie turned at random. The player turns a tile with a tap,
   the R key, Enter or Space (a quarter turn clockwise), and the water runs from the first tile as far as the pipes connect. When it
   reaches the last tile the water flows through the path and the round ends: 10 XP for each tile on the path. The round data holds the
   tile shapes and turns the player sees; the flow's order arrives obfuscated and is decoded only when the water gets through.
   Builds DOM with OwnIt.el only. */
(function () {
  'use strict';
  var OwnIt = window.OwnIt;
  var kit = OwnIt.kit;
  var XP_TILE = 10, WATER_MS = 260, WATER_TAIL = 700;
  // Sides run clockwise from the top: 0 top, 1 right, 2 bottom, 3 left. A shape's openings at turn 0.
  var BASE = { cap: [0], straight: [0, 2], corner: [0, 1], tee: [0, 1, 3] };
  var SIDE_NAME = ['top', 'right', 'bottom', 'left'];
  var DRAW = { cap: 'M12 0V12', straight: 'M12 0V24', corner: 'M12 0V12H24', tee: 'M0 12H24M12 0V12' };

  function openings(type, turn) {
    return (BASE[type] || []).map(function (d) { return (d + turn) % 4; });
  }

  function play(root, round, ctx) {
    var cols = round && round.grid && round.grid.cols;
    var tiles = (round && round.tiles) || [];
    var isCount = function (x) { return typeof x === 'number' && x >= 0 && x % 1 === 0; };
    if (!isCount(cols) || cols < 2 || !Array.isArray(tiles) || tiles.length < 2 || tiles.length % cols !== 0 || !isCount(round.start) || !isCount(round.end) ||
        round.start === round.end || round.start >= tiles.length || round.end >= tiles.length || !isCount(round.pathLength) || round.pathLength < 2 ||
        typeof round.answer !== 'string' || !tiles.every(function (t) { return t && Object.prototype.hasOwnProperty.call(BASE, t.type) && isCount(t.rot); })) {
      throw new Error('This round cannot be played: malformed pipe plumber round.');
    }
    var start = round.start, end = round.end, pathLen = round.pathLength;
    // Level extras, all optional: locked tiles, a move par (hard), a time limit and an unmarked start (impossible).
    var locked = Array.isArray(round.locked) ? round.locked.filter(isCount) : [];
    var par = isCount(round.par) && round.par > 0 ? round.par : 0;
    var limit = isCount(round.timeLimit) && round.timeLimit > 0 ? round.timeLimit : 0;
    var hidden = round.hideStart === true;
    var reachedMost = 0, fuse = null;
    var labels = round && round.labels;
    var exam = (round && round.mode === 'exam') || OwnIt.mode === 'exam';
    var mode = exam ? 'exam' : 'practice';

    var done = false;
    var cur = start;
    var turns = 0;
    var turned = !hidden; // an unmarked start shows itself once it is turned
    var turn = tiles.map(function (t) { return ((t.rot | 0) % 4 + 4) % 4; });
    var tm = kit.timers();

    var shell = OwnIt.shell(root, ctx, { zone: round && round.zone, total: pathLen, side: false });
    var area = shell.area;
    shell.setScore(0, pathLen);
    shell.startTimer();

    var panel = OwnIt.el('section', { 'class': 'panel pp-panel' });
    var goal = OwnIt.el('h2', { 'class': 'quiz-q' }, 'Turn the pipes so the request of "' + kit.label(round.flow, labels) + '" runs from ' +
      (hidden ? 'its start (not marked: look for the dead ends) ' : 'the gold tile ') + 'to the green tile.' + (locked.length ? ' Padlocked tiles cannot turn.' : ''));
    var moves = par ? OwnIt.el('p', { 'class': 'pp-moves quiz-why' }) : null;
    var board = OwnIt.el('div', { 'class': 'pp-board', role: 'group', 'aria-label': 'Pipes' });
    var live = OwnIt.el('p', { 'class': 'pp-live quiz-why', 'aria-live': 'polite' }, 'Tap a tile or press R to turn it. Arrow keys move.');
    [goal, moves, board, live].forEach(function (x) { if (x) panel.appendChild(x); });
    area.appendChild(panel);
    board.style.gridTemplateColumns = 'repeat(' + cols + ', minmax(0, 1fr))';
    var rows = tiles.length / cols;
    // Wide screens get bigger tiles, capped so the whole grid still fits a 1080px-tall window without page scroll.
    var wide = typeof window !== 'undefined' && window.innerWidth >= 1600;
    board.style.maxWidth = wide
      ? 'min(' + cols * 220 + 'px, max(' + cols * 64 + 'px, calc((100vh - 330px) * ' + cols + ' / ' + rows + ')))'
      : cols * 120 + 'px';

    var pipes = [];
    var els = tiles.map(function (t, i) {
      var b = OwnIt.el('button', { type: 'button', 'class': 'pp-tile' + (i === start && !hidden ? ' source' : '') + (locked.indexOf(i) >= 0 ? ' locked' : '') + (i === end ? ' sink' : '') });
      var pipe = OwnIt.parseSvg('<svg viewBox="0 0 24 24"><path d="' + DRAW[t.type] + '"/></svg>');
      pipe.setAttribute('class', 'pp-pipe');
      pipes.push(pipe);
      b.appendChild(pipe);
      if (locked.indexOf(i) >= 0) b.setAttribute('aria-disabled', 'true');
      b.addEventListener('click', function () { cur = i; rotate(i); });
      board.appendChild(b);
      return b;
    });

    function sides(i) {
      return openings(tiles[i].type, turn[i]).map(function (d) { return SIDE_NAME[d]; });
    }

    function paint(i) {
      pipes[i].style.transform = 'rotate(' + turn[i] * 90 + 'deg)';
      els[i].setAttribute('data-turn', String(turn[i]));
      var name = i === start && !hidden ? 'Start pipe' : i === end ? 'End pipe' : 'Pipe';
      var isLocked = locked.indexOf(i) >= 0;
      els[i].setAttribute('aria-label', name + (isLocked ? ' (locked)' : '') + ', open to the ' + sides(i).join(' and the ') + (isLocked ? '. It cannot turn.' : '. Turn with R or a tap.'));
      els[i].setAttribute('tabindex', i === cur ? '0' : '-1');
    }

    // Tiles the water reaches from the first tile, and how it got to each: a pipe passes water on only when both
    // tiles open toward each other.
    function flow() {
      var from = {};
      from[start] = -1;
      var queue = [start];
      var stepOf = [[0, -cols], [1, 1], [2, cols], [3, -1]];
      while (queue.length) {
        var i = queue.shift();
        var open = openings(tiles[i].type, turn[i]);
        stepOf.forEach(function (s) {
          if (open.indexOf(s[0]) < 0) return;
          var j = i + s[1];
          var edge = (s[0] === 1 && i % cols === cols - 1) || (s[0] === 3 && i % cols === 0);
          if (edge || j < 0 || j >= tiles.length || Object.prototype.hasOwnProperty.call(from, j)) return;
          if (openings(tiles[j].type, turn[j]).indexOf((s[0] + 2) % 4) < 0) return;
          from[j] = i;
          queue.push(j);
        });
      }
      return from;
    }

    function refresh() {
      var from = flow();
      els.forEach(function (b, i) {
        if (Object.prototype.hasOwnProperty.call(from, i) && !(hidden && i === start && !turned)) b.classList.add('reached'); else b.classList.remove('reached');
      });
      // Water also runs into decoy branches, so the count is not progress along the path: the score stays at 0 until the end tile is reached.
      var wet = Object.keys(from).length;
      reachedMost = Math.max(reachedMost, Math.min(wet, pathLen));
      if (moves) moves.textContent = 'Moves: ' + turns + ' (par ' + par + ')';
      shell.setScore(0, pathLen);
      live.textContent = 'The water reaches ' + wet + (wet === 1 ? ' tile' : ' tiles') + '. Get it to the green tile.';
      return from;
    }

    function rotate(i) {
      if (done || !tiles[i] || locked.indexOf(i) >= 0) return;
      if (i === start) { turned = true; els[i].classList.add('source'); }
      turn[i] = (turn[i] + 1) % 4;
      turns++;
      OwnIt.sound('press');
      paint(i);
      var from = refresh();
      if (Object.prototype.hasOwnProperty.call(from, end)) solve(from);
    }

    function solve(from) {
      done = true;
      if (fuse) fuse.stop();
      var route = [];
      for (var i = end; i !== -1; i = from[i]) route.unshift(i);
      var dec = OwnItCore.decode(round.answer); // the only place the flow's order is decoded
      var names = dec && Array.isArray(dec.names) ? dec.names : [];
      var reduced = OwnIt.reduced();
      route.forEach(function (idx, k) {
        var apply = function () { els[idx].classList.add('wet'); };
        if (reduced) apply(); else tm.later(apply, k * WATER_MS);
      });
      OwnIt.sound('correct');
      OwnIt.juice.confetti(panel);
      live.textContent = names.length ? 'The water flows: ' + names.join(', then ') + '.' : 'The water got through.';
      shell.setScore(pathLen, pathLen);
      var send = function () {
        // With a par, every move over it costs 2 XP, down to half of the full score.
        var full = pathLen * XP_TILE, xp = par ? Math.max(Math.floor(full / 2), full - Math.max(0, turns - par) * 2) : full;
        kit.finish(shell, ctx, { game: 'pipe-plumber', mode: mode, got: pathLen, of: pathLen, xp: xp,
          missed: [], review: [], extra: par ? { turns: turns, par: par } : { turns: turns } });
      };
      if (reduced) send(); else tm.later(send, route.length * WATER_MS + WATER_TAIL);
    }

    function timeUp() {
      if (done) return;
      done = true;
      OwnIt.sound('wrong');
      live.textContent = 'Time is up. The water reached ' + reachedMost + ' of ' + pathLen + ' tiles.';
      kit.finish(shell, ctx, { game: 'pipe-plumber', mode: mode, got: reachedMost, of: pathLen, xp: reachedMost * (XP_TILE / 2),
        missed: [], review: [{ text: 'Time ran out before the water got through.' }], extra: { turns: turns, timedOut: true } });
    }

    function focusTile(i) {
      els[cur].setAttribute('tabindex', '-1');
      cur = i;
      els[cur].setAttribute('tabindex', '0');
      els[cur].focus();
    }

    var offs = kit.arrowKeys(ctx, area, function (dx, dy) {
      if (!done) focusTile(kit.gridMove(cur, tiles.length, cols, dx, dy));
    });
    ['r', 'Enter', ' '].forEach(function (k) {
      offs.push(kit.onActivate(ctx, area, k, function (e) {
        var at = kit.targetIndex(els, e);
        if (at >= 0) cur = at;
        rotate(cur);
      }));
    });

    // Defensive: a round that arrives already connected is turned until it is not, so it never starts solved.
    for (var guard = 0; guard < 4 * tiles.length && Object.prototype.hasOwnProperty.call(flow(), end); guard++) turn[guard % tiles.length] = (turn[guard % tiles.length] + 1) % 4;
    tiles.forEach(function (t, i) { paint(i); });
    refresh();
    focusTile(cur);
    if (limit) fuse = kit.clock(panel, limit * 1000, { label: 'Seconds left', onEnd: timeUp });

    return function () {
      done = true;
      if (fuse) fuse.stop();
      tm.clear();
      kit.release(offs);
      shell.destroy();
    };
  }


  // Guided practice on a made-up row of four pipes (not from the app): turn the two middle tiles until the water runs from gold to green.
  var tutorial = {
    title: 'How to play Pipe Plumber',
    board: function (host) {
      host.classList.add('pp-board');
      host.style.gridTemplateColumns = 'repeat(4, minmax(0, 1fr))';
      host.style.maxWidth = '420px';
      var nodes = {}, turns = {};
      [['a', 'cap', 1, ' source'], ['b', 'straight', 0, ''], ['c', 'straight', 0, ''], ['d', 'cap', 3, ' sink']].forEach(function (t) {
        var b = OwnIt.el('button', { type: 'button', 'class': 'pp-tile' + t[3], 'aria-label': 'Practice pipe ' + t[0] });
        var pipe = OwnIt.parseSvg('<svg viewBox="0 0 24 24"><path d="' + DRAW[t[1]] + '"/></svg>');
        pipe.setAttribute('class', 'pp-pipe');
        pipe.style.transform = 'rotate(' + t[2] * 90 + 'deg)';
        turns[t[0]] = t[2];
        b.appendChild(pipe);
        b.addEventListener('click', function () {
          if (t[0] === 'a' || t[0] === 'd') return;
          turns[t[0]] = (turns[t[0]] + 1) % 4;
          pipe.style.transform = 'rotate(' + turns[t[0]] * 90 + 'deg)';
        });
        host.appendChild(b);
        nodes[t[0]] = b;
      });
      return nodes;
    },
    steps: [
      { title: '1. Turn a tile', text: 'A tap turns a tile a quarter turn. Turn the first middle tile until it lies flat, so it joins the gold tile.', targets: ['b'],
        nudge: 'The gold and green ends are already right. Turn a middle tile.' },
      { title: '2. Finish the path', text: 'Now turn the second middle tile. When the pipes connect, the water runs from gold to green.', targets: ['c'],
        nudge: 'Turn the other middle tile.',
        onDone: function (nodes) { ['a', 'b', 'c', 'd'].forEach(function (k) { nodes[k].classList.add('wet'); }); } },
      { title: 'Water flows', text: 'In the real round the grid is bigger and has decoys. You can also press R or Enter to turn the tile you are on.' }
    ]
  };

  OwnIt.register({
    id: 'pipe-plumber',
    name: 'Pipe Plumber',
    minutes: 4,
    keys: [['R', 'Turn the tile'], ['Enter', 'Turn the tile'], ['Arrows', 'Move between tiles'], ['Esc', 'Leave']],
    tutorial: tutorial,
    play: play
  });
})();
