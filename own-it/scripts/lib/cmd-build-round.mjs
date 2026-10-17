import { readFileSync, existsSync } from 'node:fs';
import { randomInt } from 'node:crypto';
import { resolve, join } from 'node:path';
import { check, loadSchema } from './validate.mjs';
import { getGame, GAMES_DIR } from './games.mjs';
import { loadModel } from './model.mjs';
import { loadProgress, saveProgress } from './progress.mjs';
import core from './core.mjs';
import { readJson, writeJson, writeJsRegistry, writeAggregate } from './json.mjs';
import { ownItPath } from './paths.mjs';
import { estimate } from './tokens.mjs';

// Games whose entries carry a required answer, and the array that holds them.
const ANSWERED = { quiz: 'questions', 'screen-tour': 'steps', 'guess-the-screen': 'screens' };

// Model ids a round names, per game. Every one must exist in the zone.
const IDS = {
  quiz: () => [],
  'boss-battle': () => [],
  'screen-tour': (r) => [r.screen, ...r.steps.map((s) => s.element), ...r.steps.filter((s) => s.kind !== 'role').flatMap((s) => s.choices || [])],
  'guess-the-screen': (r) => r.screens.flatMap((s) => [s.screen, ...s.choices]),
  quests: (r) => [r.flow, r.start, ...r.objectives.map((o) => o.element)],
  whiteboard: (r) => r.cards,
  'memory-match': () => [],
  'spot-the-lie': () => [],
  'chain-reaction': (r) => [r.flow],
  'whos-allowed': () => [],
  'blast-radius': (r) => [r.target],
  pager: (r) => [r.answer],
};

// Fisher-Yates with a cryptographic source, so a shuffled order cannot be predicted.
function shuffle(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

const cardOf = (it) => ({ id: it.id, label: it.label ?? it.id, kind: it.k, ref: it.ref, conf: it.conf });

// A single code-like token (snake_case, a path, a dotted name, camelCase) or backtick-wrapped text.
function identifierOnly(text) {
  const t = text.trim();
  if (/^`.*`$/.test(t)) return true;
  const bare = t.replace(/[.,;:!?]+$/, '');
  if (!bare || /\s/.test(bare)) return false;
  return /[_/.]/.test(bare) || /[a-z][A-Z]/.test(bare);
}

const HINT = 'use the name a person would say';

// Player-facing lists: answers must be one of the choices; free-text choices obey the identifier-only ban.
function checkChoices(game, input, byId) {
  const lists = game === 'screen-tour' ? ['steps', input.steps] : game === 'guess-the-screen' ? ['screens', input.screens] : null;
  if (!lists) return;
  lists[1].forEach((e, i) => {
    const choices = e.choices || [];
    const free = game === 'screen-tour' && e.kind === 'role';
    choices.forEach((c, j) => {
      if (!byId.has(c) && free && identifierOnly(c)) throw new Error(`identifier-only answer in ${lists[0]}[${i}].choices[${j}]; ${HINT}`);
    });
    if (!choices.length && game === 'screen-tour' && !byId.has(e.answer)) throw new Error(`answer not in zone "${input.zone}" in ${lists[0]}[${i}]`);
    if (choices.length && !choices.includes(e.answer)) throw new Error(`answer is not one of the choices in ${lists[0]}[${i}]`);
  });
}

// Memory-match pairs: each term and meaning is said once, and none is a bare identifier.
function checkPairs(input) {
  for (const key of ['term', 'meaning']) {
    const seen = new Set();
    input.pairs.forEach((p, i) => {
      if (identifierOnly(p[key])) throw new Error(`identifier-only answer in pairs[${i}].${key}; ${HINT}`);
      const norm = p[key].trim().toLowerCase();
      if (seen.has(norm)) throw new Error(`duplicate ${key} in pairs[${i}]`);
      seen.add(norm);
    });
  }
}

// Who's-allowed cards: a mix of verdicts (so tapping one button cannot win) and no bare identifiers in the action.
function checkPermissions(input) {
  input.cards.forEach((c, i) => {
    if (identifierOnly(c.action)) throw new Error(`identifier-only answer in cards[${i}].action; ${HINT}`);
  });
  const allows = input.cards.filter((c) => c.answer === 'allow').length;
  if (allows < 2 || input.cards.length - allows < 2) throw new Error('cards need at least 2 allow and 2 deny answers');
}

const labeled = (it) => typeof it.label === 'string' && it.label.trim() !== '';

// Blast radius: parts that depend on the target, directly or through others, nearest first.
// An edge `from` -> `to` means from calls to, so the target breaking takes down everything that can reach it.
function blastSet(input, byId, items) {
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
  for (let frontier = [input.target]; frontier.length;) {
    const next = [];
    for (const id of frontier) for (const c of callers.get(id) || []) if (!seen.has(c)) { seen.add(c); next.push(c); order.push(c); }
    frontier = next;
  }
  const shown = (id) => { const it = byId.get(id); return !!it && (it.k === 'surface' || it.k === 'component') && labeled(it); };
  const damaged = order.filter(shown);
  if (!damaged.length) throw new Error(`nothing depends on "${input.target}" in the model`);
  const rest = shuffle(items.filter((x) => (x.k === 'surface' || x.k === 'component') && labeled(x) && x.id !== input.target && !seen.has(x.id)).map((x) => x.id));
  if (!rest.length) throw new Error(`everything depends on "${input.target}"; pick a part with something independent of it`);
  const kept = damaged.slice(0, 8);
  return { damaged: kept, shown: [...kept, ...rest.slice(0, 12 - kept.length)] };
}

// Pager: the breaking step plus up to 3 look-alikes of the same kind, all with player-facing labels.
function pagerChoices(input, byId, items) {
  const answer = byId.get(input.answer);
  if (!['element', 'surface', 'component'].includes(answer.k)) throw new Error(`"${input.answer}" is not an element, surface or component`);
  const pool = items.filter((x) => x.k === answer.k && labeled(x));
  if (pool.length < 3) throw new Error(`pager needs at least 3 parts of the same kind as "${input.answer}" with labels in the model`);
  if (!labeled(answer)) throw new Error(`"${input.answer}" has no label in the model`);
  const others = shuffle(pool.filter((x) => x.id !== answer.id)).slice(0, 2 + randomInt(2));
  return shuffle([answer, ...others]);
}

// Quest objectives are elements of the quest's flow, each used once.
function checkQuest(input, byId) {
  const flow = byId.get(input.flow);
  if (flow.k !== 'flow') throw new Error(`"${input.flow}" is not a flow`);
  const seen = new Set();
  for (const o of input.objectives) {
    const it = byId.get(o.element);
    if (it.k !== 'element') throw new Error(`objective "${o.element}" is not an element`);
    if (it.does !== input.flow) throw new Error(`element "${o.element}" does not belong to flow "${input.flow}"`);
    if (seen.has(o.element)) throw new Error(`duplicate objective element "${o.element}"`);
    seen.add(o.element);
  }
  const start = byId.get(input.start);
  if (start.k !== 'surface' || byId.get(input.objectives[0].element).on !== input.start) throw new Error('start must be the screen of the first objective');
  const { reach } = reachFrom([input.start], [...byId.values()]);
  const rolesOf = (it) => (Array.isArray(it.roles) ? it.roles.filter((r) => typeof r === 'string').sort().join(',') : '');
  input.objectives.forEach((o, i) => {
    const it = byId.get(o.element);
    if (reach.has(it.on)) return;
    // A role switch is the other way in: this step needs a different role than the one before it.
    const switched = i > 0 && rolesOf(it) !== '' && rolesOf(it) !== rolesOf(byId.get(input.objectives[i - 1].element));
    if (!switched) throw new Error(`objective ${o.element} not reachable from start`);
  });
}

// A flow's step cards in order: the groups flattened, repeats dropped, ids outside the zone ignored.
function flowSteps(flow, byId) {
  const seen = new Set();
  for (const g of Array.isArray(flow.steps) ? flow.steps : []) for (const id of Array.isArray(g) ? g : []) if (typeof id === 'string' && byId.has(id)) seen.add(id);
  return [...seen];
}

// Surface ids a round shows, so a map-rung pass counts toward coverage.
function shownCards(game, input, byId) {
  const ids = game === 'screen-tour' ? [input.screen, ...input.steps.map((s) => s.element && byId.get(s.element)?.on)]
    : game === 'guess-the-screen' ? input.screens.map((s) => s.screen)
      : game === 'whiteboard' ? input.cards
        : game === 'chain-reaction' ? flowSteps(byId.get(input.flow), byId) : [];
  return [...new Set(ids.filter((x) => typeof x === 'string' && byId.has(x)))];
}

// Replaces every `answer` / `answers` field (at any depth) with its obfuscated form.
function obfuscate(v) {
  if (Array.isArray(v)) return v.map(obfuscate);
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === 'answer' || k === 'answers' ? core.encode(x) : obfuscate(x)]));
  }
  return v;
}

// Player-facing names for every model id a round shows, so the games never display raw ids. Not obfuscated.
// Answer-only ids (a "find" step's target) are deliberately left out: a label there would give the answer away.
function labelsFor(named, byId) {
  const out = {};
  for (const id of named) {
    const it = byId.get(id);
    if (!it) continue;
    const entry = { label: typeof it.label === 'string' && it.label ? it.label : it.id };
    if (typeof it.k === 'string' && it.k) entry.kind = it.k;
    if (typeof it.purpose === 'string' && it.purpose) entry.purpose = it.purpose;
    out[id] = entry;
  }
  return out;
}

// Fills in answers the model already knows, so Claude never has to write them.
function derive(game, round, byId, items) {
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
    const { damaged, shown } = blastSet(round, byId, items);
    round.cards = shuffle(shown).map((id) => ({ id, label: byId.get(id).label }));
    round.answer = damaged;
  } else if (game === 'pager') {
    round.cards = pagerChoices(round, byId, items).map((x) => ({ id: x.id, label: x.label }));
  }
}

// Navigation facts for a quest: every element on a screen the player can reach by following `goes` from `start` or from any objective's screen (a role switch lands there).
// Plain data (not answers): the game needs them to move between screens and to know who may use what.
function reachFrom(starts, items) {
  const els = items.filter((x) => x.k === 'element' && typeof x.on === 'string');
  const reach = new Set(starts);
  for (let grew = true; grew;) {
    grew = false;
    for (const e of els) if (reach.has(e.on) && typeof e.goes === 'string' && !reach.has(e.goes)) { reach.add(e.goes); grew = true; }
  }
  return { els, reach };
}

function navFor(input, items) {
  const byId = new Map(items.map((x) => [x.id, x]));
  const screens = [input.start, ...input.objectives.map((o) => byId.get(o.element).on)];
  const { els, reach } = reachFrom(screens, items);
  return Object.fromEntries(els.filter((e) => reach.has(e.on)).map((e) => {
    const n = { on: e.on };
    if (typeof e.goes === 'string') n.goes = e.goes;
    if (Array.isArray(e.roles) && e.roles.length) n.roles = e.roles.filter((r) => typeof r === 'string');
    return [e.id, n];
  }));
}

export async function run(args, ctx) {
  const [game, arg] = args._;
  if (!game || !arg) throw new Error('usage: build-round <game> <file>');
  const meta = getGame(game);
  if (!meta) throw new Error(`unknown game "${game}"`);
  const schemaPath = join(GAMES_DIR, `${game}.schema.json`);
  if (!existsSync(schemaPath)) throw new Error(`game "${game}" has no round schema yet`);

  const file = resolve(ctx.root, arg);
  let text;
  try { text = readFileSync(file, 'utf8').replace(/^﻿/, ''); } catch { throw new Error(`missing file ${file}`); }
  let input;
  try { input = JSON.parse(text); } catch { throw new Error(`invalid JSON in ${file}`); }
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error(`invalid round: (root): expected object`);

  const list = ANSWERED[game];
  if (list && Array.isArray(input[list])) {
    input[list].forEach((x, i) => {
      if (x && typeof x === 'object' && x.answer === undefined) throw new Error(`missing answer in ${list}[${i}]`);
    });
  }
  const errs = check(input, loadSchema(schemaPath));
  if (errs.length) throw new Error(`invalid round: ${errs.join('; ')}`);

  if (game === 'quiz') {
    input.questions.forEach((q, i) => q.options.forEach((o, j) => {
      if (identifierOnly(o.text)) throw new Error(`identifier-only answer in questions[${i}].options[${j}]`);
    }));
  }

  const model = loadModel(ctx.root);
  if (!Object.hasOwn(model.zones, input.zone)) throw new Error(`unknown zone "${input.zone}"`);
  const items = model.zones[input.zone].items || [];
  const byId = new Map(items.map((x) => [x.id, x]));
  const named = [...new Set(IDS[game](input).filter((x) => typeof x === 'string'))];
  const foreign = named.filter((x) => !byId.has(x));
  if (foreign.length) throw new Error(`ids not in zone "${input.zone}": ${foreign.join(', ')}`);

  checkChoices(game, input, byId);
  if (game === 'quests') checkQuest(input, byId);
  if (game === 'memory-match') checkPairs(input);
  if (game === 'spot-the-lie') input.statements.forEach((s, i) => { if (identifierOnly(s.text)) throw new Error(`identifier-only answer in statements[${i}].text; ${HINT}`); });
  if (game === 'whos-allowed') checkPermissions(input);
  if (game === 'pager') {
    if (identifierOnly(input.failure)) throw new Error(`identifier-only answer in failure; ${HINT}`);
    input.logs.forEach((l, i) => { if (identifierOnly(l)) throw new Error(`identifier-only answer in logs[${i}]; ${HINT}`); });
  }
  if (game === 'chain-reaction') {
    const flow = byId.get(input.flow);
    if (flow.k !== 'flow') throw new Error(`"${input.flow}" is not a flow`);
    if (flowSteps(flow, byId).length < 2) throw new Error(`flow "${input.flow}" needs at least 2 steps in the model`);
  }
  const progress = loadProgress(ctx.root);
  const id = `${input.zone}-${game}-${progress.seq + 1}`;
  const round = { ...input };
  derive(game, round, byId, items);
  const labelIds = new Set(named);
  for (const id of named) { const it = byId.get(id); if (it && it.k === 'element') for (const x of [it.on, it.goes]) if (typeof x === 'string') labelIds.add(x); }
  if (game === 'chain-reaction' || game === 'blast-radius' || game === 'pager') round.cards.forEach((c) => labelIds.add(c.id));
  const nav = game === 'quests' ? navFor(input, items) : null;
  if (nav) for (const [eid, n] of Object.entries(nav)) for (const x of [eid, n.on, n.goes, ...(n.roles || [])]) if (typeof x === 'string') labelIds.add(x);
  const data = { id, game, zone: input.zone, rung: meta.rung, ...obfuscate(round), ...(nav ? { nav } : {}), labels: labelsFor(labelIds, byId) };

  // All validation done; write.
  const sessionPath = ownItPath(ctx.root, 'session.json');
  const session = readJson(sessionPath, { session: ctx.now().toISOString(), mode: 'practice', missions: {} });
  session.rounds = { ...(session.rounds || {}), [id]: { game, zone: input.zone, rung: meta.rung,
    mode: input.mode || session.mode || 'practice',
    cardIds: game === 'blast-radius' ? [round.target, ...round.cards.map((c) => c.id)] : shownCards(game, input, byId) } };
  const dataJs = ownItPath(ctx.root, 'data', `${id}.js`);
  writeJsRegistry(dataJs, 'OWNIT_ROUNDS', id, data);
  writeAggregate(ownItPath(ctx.root, 'data'), ownItPath(ctx.root, 'rounds.js'), 'OWNIT_ROUNDS', (f) => !f.startsWith('feedback-'));
  writeJson(sessionPath, session);
  progress.seq += 1;
  saveProgress(ctx.root, progress);
  return { id, est: estimate(text, readFileSync(dataJs, 'utf8')) };
}
