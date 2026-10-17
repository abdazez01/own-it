import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { check, loadSchema } from './validate.mjs';
import { getGame, GAMES_DIR } from './games.mjs';
import { loadModel } from './model.mjs';
import { loadProgress, saveProgress, defaultZoneProgress } from './progress.mjs';
import core from './core.mjs';
import { readJson, writeJson, writeJsRegistry, writeAggregate } from './json.mjs';
import { ownItPath } from './paths.mjs';
import { estimate } from './tokens.mjs';
import { derive, flowSteps, scaleCase, nextTickRound } from './round-derive.mjs';

// Games whose entries carry a required answer, and the array that holds them.
const ANSWERED = { quiz: 'questions', 'screen-tour': 'steps', 'guess-the-screen': 'screens', 'next-tick': 'ticks' };

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
  'pipe-plumber': (r) => [r.flow],
  'what-if': () => [],
  'data-detective': (r) => r.states.map((x) => x.state),
  'design-duel': () => [],
  'escape-room': (r) => r.puzzles.flatMap((p) => (p.kind === 'flow' ? [p.flow] : p.kind === 'failure' ? [p.answer] : [])),
  'teach-back': (r) => [r.screen],
  'case-file': (r) => [r.case.answer, ...r.case.suspects],
  'next-tick': (r) => [r.flow, ...r.ticks.map((t) => t.step)],
};


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
    for (const key of ['action', 'role']) if (identifierOnly(c[key])) throw new Error(`identifier-only answer in cards[${i}].${key}; ${HINT}`);
  });
  const allows = input.cards.filter((c) => c.answer === 'allow').length;
  if (allows < 2 || input.cards.length - allows < 2) throw new Error('cards need at least 2 allow and 2 deny answers');
}

// What-if dials: the prompt and every option are words, and no two options read the same.
function checkDials(input) {
  input.dials.forEach((d, i) => {
    if (identifierOnly(d.label)) throw new Error(`identifier-only answer in dials[${i}].label; ${HINT}`);
    const seen = new Set();
    d.options.forEach((o, j) => {
      if (identifierOnly(o)) throw new Error(`identifier-only answer in dials[${i}].options[${j}]; ${HINT}`);
      const norm = o.trim().toLowerCase();
      if (seen.has(norm)) throw new Error(`duplicate option in dials[${i}].options[${j}]`);
      seen.add(norm);
    });
  });
}

// Design duel: every design and reason is words, no reason repeats within a decision, and the two designs differ.
function checkDuel(input) {
  const norm = (t) => t.trim().toLowerCase();
  input.decisions.forEach((d, i) => {
    for (const key of ['real', 'alt']) if (identifierOnly(d[key])) throw new Error(`identifier-only answer in decisions[${i}].${key}; ${HINT}`);
    if (norm(d.real) === norm(d.alt)) throw new Error(`decisions[${i}]: real and alt are the same design`);
    const seen = new Set();
    d.reasons.forEach((x, j) => {
      if (identifierOnly(x)) throw new Error(`identifier-only answer in decisions[${i}].reasons[${j}]; ${HINT}`);
      if (seen.has(norm(x))) throw new Error(`duplicate reason in decisions[${i}].reasons[${j}]`);
      seen.add(norm(x));
    });
  });
}

// Escape room: the words a player reads in each puzzle may not be bare identifiers.
function checkRoom(input) {
  input.puzzles.forEach((p, i) => {
    const words = [['role', p.role], ['action', p.action], ['failure', p.failure], ...(Array.isArray(p.logs) ? p.logs.map((l, j) => [`logs[${j}]`, l]) : [])];
    for (const [key, text] of words) if (typeof text === 'string' && identifierOnly(text)) throw new Error(`identifier-only answer in puzzles[${i}].${key}; ${HINT}`);
  });
}

// Puzzle keys name what a puzzle asks, so a repeat is caught inside a room and across rooms of the same zone.
const norm = (t) => String(t ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const puzzleKey = (p) => (p.kind === 'role' ? `role:${norm(p.role)}|${norm(p.action)}` : p.kind === 'flow' ? `flow:${p.flow}` : `failure:${norm(p.failure)}`);

function checkRepeats(input, used, items) {
  const keys = input.puzzles.map(puzzleKey);
  const dup = keys.findIndex((k, i) => keys.indexOf(k) !== i);
  if (dup >= 0) throw new Error(`duplicate puzzle in puzzles[${dup}]; write a different one`);
  const flowKeys = items.filter((x) => x.k === 'flow').map((x) => `flow:${x.id}`);
  const flowPoolUsed = flowKeys.length > 0 && flowKeys.every((k) => used.includes(k));
  keys.forEach((k, i) => {
    if (!used.includes(k) || (k.startsWith('flow:') && flowPoolUsed)) return;
    throw new Error(`puzzles[${i}] repeats an earlier room in zone "${input.zone}": ${k.replace(':', ' ')}; write a different one`);
  });
}

// Next tick: a scene of fields, then 4 to 6 ticks along one flow. Steps exist and follow the flow order; changes name real fields and really change them;
// every sentence a player reads is words. Attaches each tick's code line (`ref`) from the model, to be obfuscated by nextTickRound.
const FIELD_OK = (v) => (typeof v === 'string' && v.trim() !== '') || (typeof v === 'number' && Number.isFinite(v));
function checkTicks(input, byId) {
  const flow = byId.get(input.flow);
  if (flow.k !== 'flow') throw new Error(`"${input.flow}" is not a flow`);
  const order = flowSteps(flow, byId);
  if (order.length < 2) throw new Error(`flow "${input.flow}" needs at least 2 steps in the model`);
  const { entity, fields } = input.start;
  if (typeof entity !== 'string' || !entity.trim()) throw new Error('start.entity: expected text');
  if (identifierOnly(entity)) throw new Error(`identifier-only answer in start.entity; ${HINT}`);
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) throw new Error('start.fields: expected object');
  const names = Object.keys(fields);
  if (names.length < 1 || names.length > 8) throw new Error('start.fields: 1 to 8 fields');
  const words = (where, v) => { if (typeof v === 'string' && identifierOnly(v)) throw new Error(`identifier-only answer in ${where}; ${HINT}`); };
  for (const f of names) {
    words(`start.fields name "${f}"`, f);
    if (!FIELD_OK(fields[f])) throw new Error(`start.fields.${f}: expected a number or a non-empty string`);
    words(`start.fields.${f}`, fields[f]);
  }
  let cur = { ...fields }, at = -1;
  input.ticks.forEach((t, i) => {
    const p = `ticks[${i}]`;
    const pos = order.indexOf(t.step);
    if (pos < 0) throw new Error(`${p}.step "${t.step}" is not a step of flow "${input.flow}"`);
    if (pos < at) throw new Error(`${p}.step "${t.step}" comes before the previous tick in flow "${input.flow}"`);
    at = pos;
    if (!t.changes || typeof t.changes !== 'object' || Array.isArray(t.changes)) throw new Error(`${p}.changes: expected object`);
    const keys = Object.keys(t.changes);
    if (!keys.length) throw new Error(`${p}.changes: at least one field changes`);
    for (const k of keys) {
      if (!Object.hasOwn(cur, k)) throw new Error(`${p}.changes.${k}: not a field of the scene`);
      if (!FIELD_OK(t.changes[k])) throw new Error(`${p}.changes.${k}: expected a number or a non-empty string`);
      if (t.changes[k] === cur[k]) throw new Error(`${p}.changes.${k}: same value as before, nothing changes`);
      words(`${p}.changes.${k}`, t.changes[k]);
    }
    const seen = new Set();
    t.options.forEach((o, j) => {
      words(`${p}.options[${j}].text`, o.text);
      words(`${p}.options[${j}].why`, o.why);
      const norm = o.text.trim().toLowerCase();
      if (seen.has(norm)) throw new Error(`duplicate option in ${p}.options[${j}]`);
      seen.add(norm);
    });
    const it = byId.get(t.step);
    if (typeof it.ref !== 'string' || !it.ref) throw new Error(`step "${t.step}" has no code reference in the model`);
    t.ref = it.ref;
    cur = { ...cur, ...t.changes };
  });
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

// Surface ids a round shows, so a map-rung pass counts toward coverage.
function shownCards(game, input, byId) {
  const ids = game === 'screen-tour' ? [input.screen, ...input.steps.map((s) => s.element && byId.get(s.element)?.on)]
    : game === 'guess-the-screen' ? input.screens.map((s) => s.screen)
      : game === 'whiteboard' ? input.cards
        : game === 'chain-reaction' || game === 'pipe-plumber' || game === 'next-tick' ? flowSteps(byId.get(input.flow), byId) : [];
  return [...new Set(ids.filter((x) => typeof x === 'string' && byId.has(x)))];
}

// Replaces every `answer` / `answers` / `why` / `whys` field (at any depth) with its obfuscated form: reasons give answers away too.
function obfuscate(v) {
  if (Array.isArray(v)) return v.map(obfuscate);
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === 'answer' || k === 'answers' || k === 'why' || k === 'whys' ? core.encode(x) : obfuscate(x)]));
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
  if (game === 'what-if') checkDials(input);
  if (game === 'design-duel') checkDuel(input);
  if (game === 'escape-room') checkRoom(input);
  if (game === 'teach-back' && byId.get(input.screen).k !== 'surface') throw new Error(`"${input.screen}" is not a surface`);
  if (game === 'pager') {
    if (identifierOnly(input.failure)) throw new Error(`identifier-only answer in failure; ${HINT}`);
    input.logs.forEach((l, i) => { if (identifierOnly(l)) throw new Error(`identifier-only answer in logs[${i}]; ${HINT}`); });
  }
  if (game === 'next-tick') checkTicks(input, byId);
  if (game === 'chain-reaction') {
    const flow = byId.get(input.flow);
    if (flow.k !== 'flow') throw new Error(`"${input.flow}" is not a flow`);
    if (flowSteps(flow, byId).length < 2) throw new Error(`flow "${input.flow}" needs at least 2 steps in the model`);
  }
  if (game === 'case-file') {
    if (identifierOnly(input.case.report)) throw new Error(`identifier-only answer in case.report; ${HINT}`);
    input.case.evidence.forEach((e, i) => { if (identifierOnly(e.text)) throw new Error(`identifier-only answer in case.evidence[${i}].text; ${HINT}`); });
  }
  if (game === 'data-detective' && identifierOnly(input.entity)) throw new Error(`identifier-only answer in entity; ${HINT}`);
  const progress = loadProgress(ctx.root);
  const id = `${input.zone}-${game}-${progress.seq + 1}`;
  const round = { ...input };
  derive(game, round, byId, items);
  if (game === 'escape-room') checkRepeats(input, progress.zones[input.zone]?.usedPuzzles || [], items);
  // Movers that are not model roles are shown as written, so they must read as words.
  if (game === 'data-detective') round.who.forEach((w) => { if (!byId.has(w.id) && identifierOnly(w.label)) throw new Error(`identifier-only answer in a transition "by"; ${HINT}`); });
  const labelIds = new Set(named);
  for (const id of named) { const it = byId.get(id); if (it && it.k === 'element') for (const x of [it.on, it.goes]) if (typeof x === 'string') labelIds.add(x); }
  if (['chain-reaction', 'blast-radius', 'pager', 'data-detective'].includes(game)) round.cards.forEach((c) => labelIds.add(c.id));
  if (game === 'data-detective') round.who.forEach((c) => labelIds.add(c.id));
  if (game === 'escape-room') round.puzzles.forEach((pz) => (pz.cards || []).forEach((c) => labelIds.add(c.id)));
  const nav = game === 'quests' ? navFor(input, items) : null;
  if (nav) for (const [eid, n] of Object.entries(nav)) for (const x of [eid, n.on, n.goes, ...(n.roles || [])]) if (typeof x === 'string') labelIds.add(x);
  // The pick's level (--level, --base, --about) wins; else the level stored by the `level` command.
  const fl = args.flags;
  let st = progress.settings;
  if (fl.level !== undefined) {
    if (!['easy', 'medium', 'hard', 'impossible', 'custom'].includes(fl.level)) throw new Error('--level must be easy, medium, hard, impossible or custom');
    if (fl.level === 'custom' && !['easy', 'medium', 'hard', 'impossible'].includes(fl.base)) throw new Error('--base <easy|medium|hard|impossible> is required for custom');
    st = { level: fl.level, levelBase: fl.base, levelAbout: typeof fl.about === 'string' ? fl.about.trim() : undefined };
  }
  const lvl = st.level ? { level: st.level, ...(st.level === 'custom' ? { about: st.levelAbout, levelBase: st.levelBase } : {}) } : {};
  if (game === 'case-file') {
    // The level decides how many clues and suspects the page shows; the case is checked first, so a bad case still writes nothing.
    scaleCase(round, st.level === 'custom' ? st.levelBase : (st.level || 'medium'), byId, items);
    labelIds.clear(); // only the suspects the page shows get a label
    round.suspects.forEach((c) => labelIds.add(c.id));
  }
  if (game === 'next-tick') nextTickRound(round, lvl.level === 'custom' ? lvl.levelBase : lvl.level);
  const data = { id, game, zone: input.zone, rung: meta.rung, ...lvl, ...obfuscate(round), ...(nav ? { nav } : {}), labels: labelsFor(labelIds, byId) };

  // All validation done; write.
  const sessionPath = ownItPath(ctx.root, 'session.json');
  const session = readJson(sessionPath, { session: ctx.now().toISOString(), mode: 'practice', missions: {} });
  session.rounds = { ...(session.rounds || {}), [id]: { game, zone: input.zone, rung: meta.rung,
    mode: input.mode || session.mode || 'practice', ...lvl,
    cardIds: game === 'blast-radius' ? [round.target, ...round.cards.map((c) => c.id)] : shownCards(game, input, byId) } };
  const dataJs = ownItPath(ctx.root, 'data', `${id}.js`);
  writeJsRegistry(dataJs, 'OWNIT_ROUNDS', id, data);
  writeAggregate(ownItPath(ctx.root, 'data'), ownItPath(ctx.root, 'rounds.js'), 'OWNIT_ROUNDS', (f) => !f.startsWith('feedback-'));
  writeJson(sessionPath, session);
  progress.seq += 1;
  if (game === 'escape-room') {
    const zp = progress.zones[input.zone] || (progress.zones[input.zone] = defaultZoneProgress(input.zone));
    zp.usedPuzzles = [...new Set([...(zp.usedPuzzles || []), ...input.puzzles.map(puzzleKey)])].slice(-200);
  }
  saveProgress(ctx.root, progress);
  return { id, est: estimate(text, readFileSync(dataJs, 'utf8')) };
}
