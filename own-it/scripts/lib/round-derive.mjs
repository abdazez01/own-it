import { randomInt } from 'node:crypto';

// Fisher-Yates with a cryptographic source, so a shuffled order cannot be predicted.
export function shuffle(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export const cardOf = (it) => ({ id: it.id, label: it.label ?? it.id, kind: it.k, ref: it.ref, conf: it.conf });

export const labeled = (it) => typeof it.label === 'string' && it.label.trim() !== '';

// Blast radius: parts that depend on the target, directly or through others, nearest first.
// An edge `from` -> `to` means from calls to, so the target breaking takes down everything that can reach it.
export function blastSet(input, byId, items) {
  const target = byId.get(input.target);
  if (target.k !== 'surface' && target.k !== 'component') throw new Error(`"${input.target}" is not a surface or component`);
  if (!labeled(target)) throw new Error(`"${input.target}" has no label in the model`);
  const callers = new Map();
  for (const e of items) {
    if (e.k !== 'edge' || typeof e.from !== 'string' || typeof e.to !== 'string') continue;
    callers.set(e.to, [...(callers.get(e.to) || []), e.from]);
  }
  const seen = new Set([input.target]);
  const order = [];
  const via = new Map(); // part -> the part it calls on the way to the target
  for (let frontier = [input.target]; frontier.length;) {
    const next = [];
    for (const id of frontier) for (const c of callers.get(id) || []) if (!seen.has(c)) { seen.add(c); next.push(c); order.push(c); via.set(c, id); }
    frontier = next;
  }
  const parts = order.filter((id) => { const it = byId.get(id); return !!it && (it.k === 'surface' || it.k === 'component'); });
  const nameless = parts.filter((id) => !labeled(byId.get(id)));
  if (nameless.length) throw new Error(`dependents without labels: ${nameless.join(', ')}`);
  const damaged = parts;
  if (damaged.length > 8) throw new Error(`blast radius too large (${damaged.length} parts); pick a smaller target`);
  if (!damaged.length) throw new Error(`nothing depends on "${input.target}" in the model`);
  const rest = shuffle(items.filter((x) => (x.k === 'surface' || x.k === 'component') && labeled(x) && x.id !== input.target && !seen.has(x.id)).map((x) => x.id));
  if (!rest.length) throw new Error(`everything depends on "${input.target}"; pick a part with something independent of it`);
  const name = (id) => byId.get(id)?.label || id;
  const why = Object.fromEntries(damaged.map((id) => [id, `${name(id)} calls ${name(via.get(id))}${via.get(id) === input.target ? '' : ', which breaks too'}.`]));
  return { damaged, shown: [...damaged, ...rest.slice(0, 12 - damaged.length)], why };
}

// Pager: the breaking step plus up to 3 look-alikes of the same kind, all with player-facing labels.
export function pagerChoices(input, byId, items) {
  const answer = byId.get(input.answer);
  if (!['element', 'surface', 'component'].includes(answer.k)) throw new Error(`"${input.answer}" is not an element, surface or component`);
  const pool = items.filter((x) => x.k === answer.k && labeled(x));
  if (pool.length < 3) throw new Error(`pager needs at least 3 parts of the same kind as "${input.answer}" with labels in the model`);
  if (!labeled(answer)) throw new Error(`"${input.answer}" has no label in the model`);
  const others = shuffle(pool.filter((x) => x.id !== answer.id)).slice(0, 2 + randomInt(2));
  return shuffle([answer, ...others]);
}

// A flow's step cards in order: the groups flattened, repeats dropped, ids outside the zone ignored.
export function flowSteps(flow, byId) {
  const seen = new Set();
  for (const g of Array.isArray(flow.steps) ? flow.steps : []) for (const id of Array.isArray(g) ? g : []) if (typeof id === 'string' && byId.has(id)) seen.add(id);
  return [...seen];
}

// Data detective: the lifecycle in order, who moved the record at each step (from the model's transitions), and the
// roles or events offered as "who", in random order. Throws before anything is written if the model cannot back the round.
export function detectiveSteps(input, byId, items) {
  const order = input.states.map((s) => s.state);
  if (new Set(order).size !== order.length) throw new Error('duplicate states in the lifecycle');
  for (const id of order) {
    const it = byId.get(id);
    if (it.k !== 'state') throw new Error(`"${id}" is not a state`);
    if (!labeled(it)) throw new Error(`"${id}" has no label in the model`);
  }
  const by = [];
  for (let i = 1; i < order.length; i++) {
    const t = items.find((x) => x.k === 'transition' && x.from === order[i - 1] && x.to === order[i]);
    if (!t) throw new Error(`no transition from "${order[i - 1]}" to "${order[i]}" in the model`);
    if (typeof t.by !== 'string' || !t.by.trim()) throw new Error(`transition from "${order[i - 1]}" to "${order[i]}" has no by in the model`);
    by.push(t.by);
  }
  const named = (id) => {
    const it = byId.get(id);
    if (!it) return { id, label: id };
    if (it.k !== 'role') throw new Error(`"${id}" is not a role`);
    if (!labeled(it)) throw new Error(`"${id}" has no label in the model`);
    return { id, label: it.label };
  };
  const chosen = [...new Set(by)].map(named);
  if (chosen.length > 6) throw new Error(`too many different movers (${chosen.length}); use a shorter lifecycle`);
  const spare = shuffle(items.filter((x) => x.k === 'role' && labeled(x) && !chosen.some((c) => c.id === x.id)));
  const who = shuffle([...chosen, ...spare.slice(0, Math.max(0, 4 - chosen.length))].map((c) => ({ id: c.id, label: c.label })));
  if (who.length < 2) throw new Error('data detective needs at least 2 roles or events to choose from');
  return { order, by, who };
}

// Pipe plumber: the grid for a flow's steps. The first step is the surface that starts the request, the last a component that stores it.
// A random self-avoiding walk of one cell per step becomes the pipe path; every other cell is a spare pipe. Sides run clockwise from the
// top (0 up, 1 right, 2 down, 3 left); a shape turned r quarter turns opens its base sides plus r. The level sets the size and the trouble:
// a bigger grid, decoy tees and dead ends, fewer path tiles starting right, and (hard) locked tiles with a move par, (impossible) a timer
// and an unmarked start. Every round is solvable and none starts connected.
const PIPE_BASE = { cap: [0], straight: [0, 2], corner: [0, 1], tee: [0, 1, 3] };
export const PIPE_LEVELS = {
  easy: { cols: 4, rows: (n) => Math.max(2, Math.ceil(n / 2)), wrong: 0.5, decoys: 0, branches: 0, locked: 0, par: false, timed: false, hide: false },
  medium: { cols: 5, rows: (n) => Math.max(3, Math.ceil(n / 3) + 1), wrong: 0.7, decoys: 3, branches: 1, locked: 0, par: false, timed: false, hide: false },
  hard: { cols: 6, rows: (n) => Math.max(4, Math.ceil(n / 3) + 2), wrong: 0.85, decoys: 5, branches: 2, locked: 2, par: true, timed: false, hide: false },
  impossible: { cols: 7, rows: (n) => Math.max(4, Math.ceil(n / 3) + 2), wrong: 1, decoys: 8, branches: 3, locked: 2, par: true, timed: true, hide: true },
};
const pipeOpen = (t) => PIPE_BASE[t.type].map((d) => (d + t.rot) % 4);
// True when water from tile `start` reaches tile `end` across the whole grid (spare pipes included).
export function pipeReaches(tiles, cols, start, end) {
  const at = [-cols, 1, cols, -1];
  const seen = new Set([start]);
  for (const i of seen) {
    for (const d of pipeOpen(tiles[i])) {
      if ((d === 1 && i % cols === cols - 1) || (d === 3 && i % cols === 0)) continue;
      const j = i + at[d];
      if (j >= 0 && j < tiles.length && !seen.has(j) && pipeOpen(tiles[j]).includes((d + 2) % 4)) seen.add(j);
    }
  }
  return seen.has(end);
}

export function pipeLayout(flowId, byId, items, level = 'easy') {
  const flow = byId.get(flowId);
  if (flow.k !== 'flow') throw new Error(`"${flowId}" is not a flow`);
  const steps = flowSteps(flow, byId);
  if (steps.length < 2) throw new Error(`flow "${flowId}" needs at least 2 steps in the model`);
  if (steps.length > 12) throw new Error(`flow "${flowId}" has ${steps.length} steps; pipe plumber takes 12 at most`);
  if (byId.get(steps[0]).k !== 'surface') throw new Error(`flow "${flowId}" must start at a surface`);
  if (byId.get(steps[steps.length - 1]).k !== 'component') throw new Error(`flow "${flowId}" must end at a component`);
  const nameless = steps.filter((id) => !labeled(byId.get(id)));
  if (nameless.length) throw new Error(`steps without labels: ${nameless.join(', ')}`);

  const cfg = PIPE_LEVELS[level] || PIPE_LEVELS.medium;
  const n = steps.length, cols = cfg.cols, rows = cfg.rows(n);
  const stepTo = [-cols, 1, cols, -1];
  const near = (i) => stepTo.map((d, side) => [side, i + d]).filter(([side, j]) => j >= 0 && j < cols * rows
    && !(side === 1 && i % cols === cols - 1) && !(side === 3 && i % cols === 0));
  const walk = (path) => {
    if (path.length === n) return path;
    for (const [, j] of shuffle(near(path[path.length - 1]))) {
      if (path.includes(j)) continue;
      const found = walk([...path, j]);
      if (found) return found;
    }
    return null;
  };
  let cells = null;
  for (const first of shuffle([...Array(cols * rows).keys()])) { cells = walk([first]); if (cells) break; }

  const tiles = Array.from({ length: cols * rows }, () => null);
  const need = new Map(); // path cell -> the sides it must open
  cells.forEach((cell, k) => {
    const sides = [k > 0 ? cells[k - 1] : null, k < n - 1 ? cells[k + 1] : null].filter((x) => x !== null).map((o) => stepTo.indexOf(o - cell));
    tiles[cell] = { type: sides.length === 1 ? 'cap' : (sides[0] + 2) % 4 === sides[1] ? 'straight' : 'corner' };
    need.set(cell, sides);
  });
  const onPath = new Set(cells);
  // Branches: a few middle path tiles become tees, so water can also run off the path.
  shuffle(cells.slice(1, -1)).slice(0, cfg.branches).forEach((c) => { tiles[c].type = 'tee'; });
  // Decoys: tees and dead ends on spare cells, those next to the path first.
  const spare = [...tiles.keys()].filter((c) => !onPath.has(c));
  const nextToPath = (c) => near(c).some(([, j]) => onPath.has(j));
  const ordered = [...shuffle(spare.filter(nextToPath)), ...shuffle(spare.filter((c) => !nextToPath(c)))];
  ordered.slice(0, cfg.decoys).forEach((c, i) => { tiles[c] = { type: i % 2 ? 'cap' : 'tee' }; });
  tiles.forEach((t, cell) => { if (!t) tiles[cell] = { type: Object.keys(PIPE_BASE)[randomInt(4)] }; });

  const fits = (cell, rot) => { const open = pipeOpen({ type: tiles[cell].type, rot }); return need.get(cell).every((d) => open.includes(d)); };
  const rotsOf = (cell, want) => [0, 1, 2, 3].filter((r) => fits(cell, r) === want);
  const pick = (list) => list[randomInt(list.length)];
  // Locked tiles (hard and up): one on the path, already right, and decoys that stay as they lie.
  const lockedPath = cfg.locked ? shuffle(cells.slice(1, -1)).slice(0, 1) : [];
  const lockedSpare = cfg.locked ? shuffle(spare).slice(0, Math.max(0, cfg.locked - lockedPath.length)) : [];
  const free = cells.filter((c) => !lockedPath.includes(c));
  const wrongMin = Math.min(free.length, Math.max(1, cfg.wrong === 0.5 ? Math.floor(n / 2) : Math.ceil(n * cfg.wrong)));
  for (let tries = 0; ; tries++) {
    if (tries > 5000) throw new Error('could not lay out the pipes; try again');
    const more = cfg.wrong === 1 ? 0 : randomInt(free.length - wrongMin + 1);
    const wrongSet = new Set(shuffle(free).slice(0, wrongMin + more));
    cells.forEach((c) => { tiles[c].rot = pick(rotsOf(c, !wrongSet.has(c))); });
    spare.forEach((c) => { tiles[c].rot = randomInt(4); });
    if (!pipeReaches(tiles, cols, cells[0], cells[n - 1])) break;
  }
  const out = { grid: { cols, rows }, tiles, start: cells[0], end: cells[n - 1], pathLength: n, cells, names: steps.map((id) => byId.get(id).label) };
  out.decoys = tiles.filter((t, c) => t.type === 'tee' || (!onPath.has(c) && t.type === 'cap')).length;
  if (cfg.locked) out.locked = [...lockedPath, ...lockedSpare].sort((a, b) => a - b);
  if (cfg.par) {
    const turnsTo = (c) => [0, 1, 2, 3].find((k) => fits(c, (tiles[c].rot + k) % 4));
    out.par = free.reduce((sum, c) => sum + turnsTo(c), 0) + 2;
  }
  if (cfg.timed) out.timeLimit = 20 + 12 * n;
  if (cfg.hide) out.hideStart = true;
  return out;
}

// Design duel: each decision's two designs land on random sides and its reasons in random order. The real side and reason live only in the answer.
export function duelDecisions(decisions) {
  return shuffle(decisions).map((d) => {
    const side = randomInt(2);
    const order = shuffle(d.reasons.map((_, i) => i));
    const [a, b] = side === 0 ? [d.real, d.alt] : [d.alt, d.real];
    return { a, b, reasons: order.map((i) => d.reasons[i]), answer: { side, reason: order.indexOf(d.answer) } };
  });
}

// Escape room: one puzzle of each kind, in random order. The role puzzle is an allow or deny card, the flow puzzle a scrambled flow
// (as in chain reaction), the failure puzzle a pager round. Throws before anything is written if the model cannot back a puzzle.
export function roomPuzzles(input, byId, items) {
  const kinds = input.puzzles.map((p) => p.kind).sort().join(',');
  if (kinds !== 'failure,flow,role') throw new Error('escape room needs one puzzle of each kind: role, flow and failure');
  return shuffle(input.puzzles.map((p, i) => {
    const at = `puzzles[${i}]`;
    if (p.kind === 'role') {
      for (const k of ['role', 'action', 'answer', 'why']) if (typeof p[k] !== 'string' || !p[k].trim()) throw new Error(`${at}.${k} is required for a role puzzle`);
      if (p.answer !== 'allow' && p.answer !== 'deny') throw new Error(`${at}: role answer must be allow or deny`);
      return { kind: 'role', role: p.role, action: p.action, answer: p.answer, why: p.why };
    }
    if (p.kind === 'flow') {
      if (typeof p.flow !== 'string') throw new Error(`${at}.flow is required for a flow puzzle`);
      const flow = byId.get(p.flow);
      if (flow.k !== 'flow') throw new Error(`"${p.flow}" is not a flow`);
      const order = flowSteps(flow, byId);
      if (order.length < 2) throw new Error(`flow "${p.flow}" needs at least 2 steps in the model`);
      let scrambled = shuffle(order);
      while (scrambled.every((id, j) => id === order[j])) scrambled = shuffle(order);
      return { kind: 'flow', flow: p.flow, cards: scrambled.map((id) => cardOf(byId.get(id))), answer: order };
    }
    if (typeof p.failure !== 'string' || !p.failure.trim() || !Array.isArray(p.logs) || typeof p.answer !== 'string') throw new Error(`${at} needs failure, logs and answer for a failure puzzle`);
    return { kind: 'failure', failure: p.failure, logs: p.logs, cards: pagerChoices(p, byId, items).map((x) => ({ id: x.id, label: x.label })), answer: p.answer };
  }));
}

// Fills in answers the model already knows, so Claude never has to write them.
export function derive(game, round, byId, items, level = 'medium') {
  if (game === 'quests') {
    round.answer = round.objectives.map((o) => {
      const it = byId.get(o.element);
      if (typeof it.does !== 'string' || !it.does) throw new Error(`element "${it.id}" has no does in the model`);
      return { element: it.id, on: it.on, does: it.does, goes: it.goes };
    });
  } else if (game === 'whiteboard') {
    if (new Set(round.cards).size !== round.cards.length) throw new Error('duplicate cards in whiteboard');
    const set = new Set(round.cards);
    round.cards = round.cards.map((id) => cardOf(byId.get(id)));
    round.answer = { edges: items.filter((x) => x.k === 'edge' && set.has(x.from) && set.has(x.to)).map((x) => ({ id: x.id, from: x.from, to: x.to })) };
  } else if (game === 'memory-match') {
    // Terms and meanings are each randomly permuted, and no meaning sits at its own term's place or at a fixed offset from it,
    // so the data order gives nothing away; the pairing is only in the obfuscated answer.
    const n = round.pairs.length;
    const p = shuffle([...Array(n).keys()]);
    let q;
    do q = shuffle([...Array(n).keys()]);
    while (q.some((x, j) => x === p[j]) || [...Array(n).keys()].some((off) => q.every((x, j) => x === p[(j + off) % n])));
    round.terms = p.map((i) => round.pairs[i].term);
    round.meanings = q.map((i) => round.pairs[i].meaning);
    round.answer = p.map((i) => q.indexOf(i));
    delete round.pairs;
  } else if (game === 'chain-reaction') {
    const order = flowSteps(byId.get(round.flow), byId);
    let scrambled = shuffle(order);
    while (scrambled.every((id, i) => id === order[i])) scrambled = shuffle(order);
    scrambled = scrambled.map((id) => cardOf(byId.get(id)));
    round.cards = scrambled;
    round.answer = order;
  } else if (game === 'whos-allowed') {
    // Shuffled so the order in the file gives nothing away; each card's verdict is obfuscated by obfuscate().
    round.cards = shuffle(round.cards);
  } else if (game === 'blast-radius') {
    const { damaged, shown, why } = blastSet(round, byId, items);
    round.cards = shuffle(shown).map((id) => ({ id, label: byId.get(id).label }));
    round.answer = damaged;
    round.why = why;
  } else if (game === 'pager') {
    round.cards = pagerChoices(round, byId, items).map((x) => ({ id: x.id, label: x.label }));
  } else if (game === 'pipe-plumber') {
    const { cells, names, ...layout } = pipeLayout(round.flow, byId, items, level);
    Object.assign(round, layout);
    round.answer = { cells, names };
  } else if (game === 'what-if') {
    // Each dial's options are permuted, so the position Claude wrote the answer at gives nothing away.
    round.dials = round.dials.map((d) => {
      const perm = shuffle(d.options.map((_, i) => i));
      return { ...d, options: perm.map((i) => d.options[i]), answer: perm.indexOf(d.answer) };
    });
  } else if (game === 'design-duel') {
    round.decisions = duelDecisions(round.decisions);
  } else if (game === 'escape-room') {
    round.puzzles = roomPuzzles(round, byId, items);
  } else if (game === 'data-detective') {
    const { order, by, who } = detectiveSteps(round, byId, items);
    let scrambled = shuffle(order);
    while (scrambled.every((id, i) => id === order[i])) scrambled = shuffle(order);
    round.cards = scrambled.map((id) => ({ id, label: byId.get(id).label }));
    round.who = who;
    round.answer = { order, by };
    delete round.states;
  }
}

