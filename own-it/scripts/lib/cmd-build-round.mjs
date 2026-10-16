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
  'screen-tour': (r) => [r.screen, ...r.steps.map((s) => s.element)],
  'guess-the-screen': (r) => r.screens.map((s) => s.screen),
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

  const progress = loadProgress(ctx.root);
  const id = `${input.zone}-${game}-${progress.seq + 1}`;
  const round = { ...input };
  derive(game, round, byId, items);
  const data = { id, game, zone: input.zone, rung: meta.rung, ...obfuscate(round) };

  // All validation done; write.
  const sessionPath = ownItPath(ctx.root, 'session.json');
  const session = readJson(sessionPath, { session: ctx.now().toISOString(), mode: 'practice', missions: {} });
  if (input.mode) session.mode = input.mode;
  session.round = { id, game, zone: input.zone, rung: meta.rung };
  const dataJs = ownItPath(ctx.root, 'data', `${id}.js`);
  writeJsVar(dataJs, 'OWNIT_ROUND', data);
  writeJson(sessionPath, session);
  progress.seq += 1;
  saveProgress(ctx.root, progress);
  return { id, est: estimate(text, readFileSync(dataJs, 'utf8')) };
}
