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
    var cols = Math.max(1, (round && round.grid && round.grid.cols) | 0);
    var tiles = ((round && round.tiles) || []).filter(function (t) { return t && BASE[t.type]; });
    var rows = Math.ceil(tiles.length / cols);
    var start = round && typeof round.start === 'number' ? round.start : 0;
    var end = round && typeof round.end === 'number' ? round.end : tiles.length - 1;
    var pathLen = Math.max(2, (round && round.pathLength) | 0);
    var labels = round && round.labels;
    var exam = (round && round.mode === 'exam') || OwnIt.mode === 'exam';
    var mode = exam ? 'exam' : 'practice';
    var playable = tiles.length === cols * rows && tiles.length >= 2 && start !== end && !!tiles[start] && !!tiles[end];

    var done = false;
    var cur = playable ? start : 0;
    var turns = 0;
    var turn = tiles.map(function (t) { return ((t.rot | 0) % 4 + 4) % 4; });
    var tm = kit.timers();

    var shell = OwnIt.shell(root, ctx, { zone: round && round.zone, total: pathLen, side: false });
    var area = shell.area;
    shell.setScore(0, pathLen);
    shell.startTimer();

    var panel = OwnIt.el('section', { 'class': 'panel pp-panel' });
    var goal = OwnIt.el('h2', { 'class': 'quiz-q' }, 'Turn the pipes so the request from "' + (tiles[start] && tiles[start].id ? kit.label(tiles[start].id, labels) : 'the start') +
      '" reaches "' + (tiles[end] && tiles[end].id ? kit.label(tiles[end].id, labels) : 'the end') + '".');
    var board = OwnIt.el('div', { 'class': 'pp-board', role: 'group', 'aria-label': 'Pipes' });
    var live = OwnIt.el('p', { 'class': 'pp-live quiz-why', 'aria-live': 'polite' }, 'Tap a tile or press R to turn it. Arrow keys move.');
    [goal, board, live].forEach(function (x) { panel.appendChild(x); });
    area.appendChild(panel);
    board.style.gridTemplateColumns = 'repeat(' + cols + ', minmax(0, 1fr))';
    board.style.maxWidth = cols * 120 + 'px';

    var pipes = [];
    var els = tiles.map(function (t, i) {
      var b = OwnIt.el('button', { type: 'button', 'class': 'pp-tile' + (i === start ? ' source' : '') + (i === end ? ' sink' : '') });
      var pipe = OwnIt.parseSvg('<svg viewBox="0 0 24 24"><path d="' + DRAW[t.type] + '"/></svg>');
      pipe.setAttribute('class', 'pp-pipe');
      pipes.push(pipe);
      b.appendChild(pipe);
      b.appendChild(OwnIt.el('span', { 'class': 'pp-name' }, t.id ? kit.label(t.id, labels) : ''));
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
      var name = tiles[i].id ? kit.label(tiles[i].id, labels) : 'Spare pipe';
      els[i].setAttribute('aria-label', name + ', open to the ' + sides(i).join(' and the ') + '. Turn with R or a tap.');
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
        if (Object.prototype.hasOwnProperty.call(from, i)) b.classList.add('reached'); else b.classList.remove('reached');
      });
      var count = Math.min(Object.keys(from).length, pathLen);
      shell.setScore(count, pathLen);
      live.textContent = 'The water reaches ' + count + ' of ' + pathLen + ' tiles.';
      return from;
    }

    function rotate(i) {
      if (done || !tiles[i]) return;
      turn[i] = (turn[i] + 1) % 4;
      turns++;
      OwnIt.sound('press');
      paint(i);
      var from = refresh();
      if (Object.prototype.hasOwnProperty.call(from, end)) solve(from);
    }

    function solve(from) {
      done = true;
      var route = [];
      for (var i = end; i !== -1; i = from[i]) route.unshift(i);
      var dec = OwnItCore.decode(round.answer); // the only place the flow's order is decoded
      var names = (dec && Array.isArray(dec.path) ? dec.path : []).map(function (id) { return kit.label(id, labels); });
      var reduced = OwnIt.reduced();
      route.forEach(function (idx, k) {
        var apply = function () { els[idx].classList.add('wet'); };
        if (reduced) apply(); else tm.later(apply, k * WATER_MS);
      });
      OwnIt.sound('correct');
      OwnIt.juice.confetti(panel);
      live.textContent = names.length ? 'The water flows: ' + names.join(', then ') + '.' : 'The water got through.';
      shell.setScore(route.length, Math.max(pathLen, route.length));
      var send = function () {
        kit.finish(shell, ctx, { game: 'pipe-plumber', mode: mode, got: route.length, of: Math.max(pathLen, route.length), xp: route.length * XP_TILE,
          missed: [], review: [], extra: { turns: turns } });
      };
      if (reduced) send(); else tm.later(send, route.length * WATER_MS + WATER_TAIL);
    }

    function focusTile(i) {
      els[cur].setAttribute('tabindex', '-1');
      cur = i;
      els[cur].setAttribute('tabindex', '0');
      els[cur].focus();
    }

    var offs = kit.arrowKeys(ctx, area, function (dx, dy) {
      if (done || !playable) return;
      var col = cur % cols, row = Math.floor(cur / cols);
      var nc = col + dx, nr = row + dy;
      if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) return;
      focusTile(nr * cols + nc);
    });
    ['r', 'Enter', ' '].forEach(function (k) {
      offs.push(kit.onActivate(ctx, area, k, function (e) {
        var at = kit.targetIndex(els, e);
        if (at >= 0) cur = at;
        if (playable) rotate(cur);
      }));
    });

    if (playable) {
      tiles.forEach(function (t, i) { paint(i); });
      refresh();
      focusTile(cur);
    } else {
      done = true;
      shell.stopTimer();
      live.textContent = 'This round has no pipes. Ask Claude to build a new pipe plumber round, then pick it again from the board.';
    }

    return function () {
      done = true;
      tm.clear();
      kit.release(offs);
      shell.destroy();
    };
  }

  OwnIt.register({
    id: 'pipe-plumber',
    name: 'Pipe Plumber',
    minutes: 4,
    keys: [['R', 'Turn the tile'], ['Enter', 'Turn the tile'], ['Arrows', 'Move between tiles'], ['Esc', 'Leave']],
    play: play
  });
})();
