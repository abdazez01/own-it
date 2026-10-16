import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { check, loadSchema } from './validate.mjs';
import { getGame, GAMES_DIR } from './games.mjs';
import { loadModel } from './model.mjs';
import { loadProgress, saveProgress } from './progress.mjs';
import core from './core.mjs';
import { readJson, writeJson, writeJsVar } from './json.mjs';
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
};

const cardOf = (it) => ({ id: it.id, label: it.label ?? it.id, ref: it.ref, conf: it.conf });

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
    if (choices.length && !choices.includes(e.answer)) throw new Error(`answer is not one of the choices in ${lists[0]}[${i}]`);
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
}

// Surface ids a round shows, so a map-rung pass counts toward coverage.
function shownCards(game, input, byId) {
  const ids = game === 'screen-tour' ? [input.screen, ...input.steps.map((s) => s.element && byId.get(s.element)?.on)]
    : game === 'guess-the-screen' ? input.screens.map((s) => s.screen)
      : game === 'whiteboard' ? input.cards : [];
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
  }
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
  const progress = loadProgress(ctx.root);
  const id = `${input.zone}-${game}-${progress.seq + 1}`;
  const round = { ...input };
  derive(game, round, byId, items);
  const data = { id, game, zone: input.zone, rung: meta.rung, ...obfuscate(round) };

  // All validation done; write.
  const sessionPath = ownItPath(ctx.root, 'session.json');
  const session = readJson(sessionPath, { session: ctx.now().toISOString(), mode: 'practice', missions: {} });
  session.rounds = { ...(session.rounds || {}), [id]: { game, zone: input.zone, rung: meta.rung,
    mode: input.mode || session.mode || 'practice', cardIds: shownCards(game, input, byId) } };
  const dataJs = ownItPath(ctx.root, 'data', `${id}.js`);
  writeJsVar(dataJs, 'OWNIT_ROUND', data);
  writeJson(sessionPath, session);
  progress.seq += 1;
  saveProgress(ctx.root, progress);
  return { id, est: estimate(text, readFileSync(dataJs, 'utf8')) };
}
