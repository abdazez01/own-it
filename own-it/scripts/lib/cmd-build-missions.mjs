import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { check, RECIPE } from './validate.mjs';
import { loadModel } from './model.mjs';
import { loadProgress, saveProgress, defaultZoneProgress, RUNGS } from './progress.mjs';
import core from './core.mjs';
import { writeJson, writeJsVar } from './json.mjs';
import { ownItPath, toPosix } from './paths.mjs';
import { estimate } from './tokens.mjs';

const CARD_KINDS = ['surface', 'component', 'actor'];
const BOARD_OF = { map: 'component', trace: 'swimlanes', break: 'component', boss: 'component' };
const BOSS_MAX = 15;

const cardOf = (it) => ({ id: it.id, label: it.label ?? it.id, ref: it.ref, conf: it.conf });

// FNV-1a: small stable string hash for the deterministic card shuffle.
const hash32 = (s) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h;
};
// Deterministic per mission id, so trace cards are not listed in solution order.
const shuffled = (missionId, cards) => cards
  .map((c) => ({ c, h: hash32(missionId + c.id) }))
  .sort((a, b) => a.h - b.h || (a.c.id < b.c.id ? -1 : 1))
  .map((x) => x.c);

function gate(m, pz) {
  if (m.refresh) {
    if (!pz.fogged) throw new Error(`zone "${m.zone}" is not fogged`);
    if (pz.rungs[m.rung] !== 'cleared') {
      const cleared = RUNGS.filter((r) => pz.rungs[r] === 'cleared');
      throw new Error(`refresh needs a cleared rung in zone "${m.zone}"; cleared: ${cleared.join(',') || 'none'}`);
    }
    return;
  }
  const state = Object.hasOwn(pz.rungs, m.rung) ? pz.rungs[m.rung] : 'locked';
  if (state === 'open' || state === 'cleared') return;
  let msg = `rung "${m.rung}" is locked in zone "${m.zone}"`;
  const prev = RUNGS[RUNGS.indexOf(m.rung) - 1];
  if (m.rung === 'trace' && pz.rungs.map !== 'cleared') msg += `; map needs surfaces ${m.__uncovered.join(',')}`;
  else if ((m.rung === 'break' || m.rung === 'boss') && pz.rungs[prev] !== 'cleared') msg += `; clear ${prev} first`;
  throw new Error(msg);
}

function expand(m, i, items, byId) {
  const at = `missions[${i}]`;
  const edgesWithin = (ids) => {
    const s = new Set(ids);
    return items.filter((x) => x.k === 'edge' && s.has(x.from) && s.has(x.to)).map((x) => ({ id: x.id, from: x.from, to: x.to }));
  };
  const pick = (ids) => {
    const missing = ids.filter((id) => !byId.has(id));
    if (missing.length) throw new Error(`unknown ids in ${at}: ${missing.join(', ')}`);
    return ids.map((id) => byId.get(id));
  };
  const pickCards = (ids) => {
    if (!ids || ids.length < 2 || ids.length > 12) throw new Error(`${at} needs 2-12 cards`);
    if (new Set(ids).size !== ids.length) throw new Error(`duplicate cards in ${at}`);
    const its = pick(ids);
    const bad = its.filter((x) => !CARD_KINDS.includes(x.k));
    if (bad.length) throw new Error(`${at} cards must be surface, component or actor: ${bad.map((x) => x.id).join(', ')}`);
    return its;
  };

  if (m.rung === 'map') {
    const its = pickCards(m.cards);
    return { cards: its.map(cardOf), answer: { edges: edgesWithin(its.map((x) => x.id)) } };
  }

  if (m.rung === 'trace') {
    if (!m.flow) throw new Error(`${at} needs a flow`);
    const [flow] = pick([m.flow]);
    if (flow.k !== 'flow') throw new Error(`${at}: "${m.flow}" is not a flow`);
    const steps = flow.steps || [];
    const ids = [...new Set(steps.flat())];
    const its = pick(ids);
    if (its.length < 2 || its.length > 12) throw new Error(`${at} flow needs 2-12 cards`);
    const noActor = its.filter((x) => !x.actor).map((x) => x.id);
    if (noActor.length) throw new Error(`${at} flow cards without actor: ${noActor.join(', ')}`);
    const lanes = [...new Set(steps.flat().map((id) => byId.get(id).actor))];
    return { cards: its.map(cardOf), lanes,
      answer: { steps, lanes: Object.fromEntries(its.map((x) => [x.id, x.actor])) } };
  }

  if (m.rung === 'break') {
    const its = pickCards(m.cards);
    const th = m.threats || [];
    if (th.length < 1 || th.length > 4) throw new Error(`${at} needs 1-4 threats`);
    const tits = pick(th);
    const cardIds = new Set(its.map((x) => x.id));
    for (const t of tits) {
      if (t.k !== 'failure') throw new Error(`${at}: "${t.id}" is not a failure`);
      if (!cardIds.has(t.card)) throw new Error(`threat "${t.id}" card "${t.card}" not in ${at} cards`);
    }
    return { cards: its.map(cardOf), tokens: tits.map((t) => ({ id: t.id, label: t.threat })), threatIds: th,
      answer: { edges: edgesWithin([...cardIds]), threats: tits.map((t) => ({ id: t.id, card: t.card })) } };
  }

  // boss: score every zone surface/component, or the recipe's pick when the zone is too big.
  // The pool lets the page recognise boxes for zone parts outside the scored set.
  const pool = items.filter((x) => x.k === 'surface' || x.k === 'component')
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (pool.length < 2) throw new Error(`${at} zone needs at least 2 surfaces or components`);
  let its = pool;
  if (pool.length > BOSS_MAX) {
    if (!m.cards) throw new Error(`boss in zone "${m.zone}" has ${pool.length} cards; pick up to ${BOSS_MAX} in recipe cards`);
    if (m.cards.length < 2) throw new Error(`${at} needs 2-${BOSS_MAX} cards`);
    if (new Set(m.cards).size !== m.cards.length) throw new Error(`duplicate cards in ${at}`);
    its = pick(m.cards);
    const bad = its.filter((x) => x.k !== 'surface' && x.k !== 'component');
    if (bad.length) throw new Error(`${at} cards must be surface or component: ${bad.map((x) => x.id).join(', ')}`);
  }
  return { cards: [], blank: true, pinIds: its.map((x) => x.id),
    answer: { cards: its.map(cardOf), edges: edgesWithin(its.map((x) => x.id)),
      pool: pool.map((x) => ({ id: x.id, label: x.label ?? x.id })) } };
}

export async function run(args, ctx) {
  const arg = args._[0];
  if (!arg) throw new Error('usage: build-missions <recipe.json>');
  const file = resolve(ctx.root, arg);
  let text;
  try { text = readFileSync(file, 'utf8').replace(/^﻿/, ''); } catch { throw new Error(`missing file ${file}`); }
  let recipe;
  try { recipe = JSON.parse(text); } catch { throw new Error(`invalid JSON in ${file}`); }
  const errs = check(recipe, RECIPE);
  if (errs.length) throw new Error(`invalid recipe: ${errs.join('; ')}`);

  const model = loadModel(ctx.root);
  const progress = loadProgress(ctx.root);
  const built = [];

  recipe.missions.forEach((m, i) => {
    const at = `missions[${i}]`;
    if (!Object.hasOwn(model.zones, m.zone)) throw new Error(`unknown zone "${m.zone}" in ${at}`);
    if (BOARD_OF[m.rung] !== m.board) throw new Error(`${at}: rung "${m.rung}" needs board "${BOARD_OF[m.rung]}"`);
    const zone = model.zones[m.zone];
    const items = zone.items || [];
    const byId = new Map(items.map((x) => [x.id, x]));
    const pz = Object.hasOwn(progress.zones, m.zone) ? progress.zones[m.zone] : defaultZoneProgress(zone.name);
    const covered = new Set(pz.surfacesCovered || []);
    gate({ ...m, __uncovered: items.filter((x) => x.k === 'surface' && !covered.has(x.id)).map((x) => x.id) }, pz);

    const x = expand(m, i, items, byId);
    const pins = m.pins || [];
    const shown = new Set(x.pinIds || x.cards.map((c) => c.id));
    for (const p of pins) if (!shown.has(p.card)) throw new Error(`pin card "${p.card}" not in ${at} cards`);

    const id = `${m.zone}-${m.rung}-${progress.seq + 1 + i}`;
    const mission = { id, zone: m.zone, rung: m.rung, board: m.board, brief: m.brief };
    if (x.lanes) mission.lanes = x.lanes;
    mission.cards = shuffled(id, x.cards);
    mission.pins = pins;
    if (x.tokens) mission.tokens = x.tokens;
    if (x.blank) mission.blank = true;
    mission.answer = core.encode(x.answer);
    const cardIds = x.blank ? x.answer.cards.map((c) => c.id) : x.cards.map((c) => c.id);
    // Token floor for this mission: what Claude wrote (recipe entry) plus what the helper emitted.
    const est = estimate(JSON.stringify(m), JSON.stringify(mission));
    built.push({ mission, meta: { zone: m.zone, rung: m.rung, board: m.board, cardIds,
      refresh: Boolean(m.refresh), threatIds: x.threatIds || [], est } });
  });

  // All validation done; write.
  const session = ctx.now().toISOString();
  const missionIds = built.map((b) => b.mission.id);
  const out = { session, mode: recipe.mode, root: toPosix(resolve(ctx.root)), missions: built.map((b) => b.mission) };
  const missionJs = ownItPath(ctx.root, 'mission.js');
  writeJsVar(missionJs, 'OWNIT_MISSIONS', out);
  writeJson(ownItPath(ctx.root, 'session.json'), { session, mode: recipe.mode,
    missions: Object.fromEntries(built.map((b) => [b.mission.id, b.meta])) });
  progress.seq += built.length;
  saveProgress(ctx.root, progress);
  return { session, missions: missionIds, est: estimate(text, readFileSync(missionJs, 'utf8')) };
}
