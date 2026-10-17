import { resolve } from 'node:path';
import { check, RECS } from './validate.mjs';
import { loadModel } from './model.mjs';
import { getGame } from './games.mjs';
import { readJson, writeJsVar } from './json.mjs';
import { ownItPath } from './paths.mjs';
import { loadProgress } from './progress.mjs';

// Rung preference per level, best first. Easy also pulls screen games to the front.
const ORDER = {
  easy: ['words', 'map', 'trace', 'none', 'break', 'boss'],
  medium: ['map', 'trace', 'words', 'break', 'none', 'boss'],
  hard: ['trace', 'break', 'map', 'boss', 'words', 'none'],
  impossible: ['break', 'boss', 'trace', 'map', 'words', 'none'],
};
const AVOID = { easy: ['boss'], impossible: ['words'] };

// Stable, deterministic: ties keep the order Claude wrote. Games to avoid drop out while 3 recs remain.
export function orderRecs(recs, level) {
  const score = (r) => {
    const g = getGame(r.game);
    return ORDER[level].indexOf(g.rung) * 10 - (level === 'easy' && g.usesScreens ? 15 : 0);
  };
  const sorted = recs.map((r, i) => ({ r, i, s: score(r) })).sort((a, b) => a.s - b.s || a.i - b.i).map((x) => x.r);
  const kept = sorted.filter((r) => !(AVOID[level] || []).includes(getGame(r.game).rung));
  return kept.length >= 3 ? kept : sorted;
}

export async function run(args, ctx) {
  const arg = args._[0];
  if (!arg) throw new Error('usage: build-recs <file>');
  const data = readJson(resolve(ctx.root, arg));
  const errs = check(data, RECS);
  if (errs.length) throw new Error(`invalid recs: ${errs.join('; ')}`);

  const model = loadModel(ctx.root);
  const recs = data.recs.map((r, i) => {
    const at = `recs[${i}]`;
    if (!getGame(r.game)) throw new Error(`unknown game "${r.game}" in ${at}`);
    if (!Object.hasOwn(model.zones, r.zone)) throw new Error(`unknown zone "${r.zone}" in ${at}`);
    return { game: r.game, zone: r.zone, reason: r.reason };
  });
  const st = loadProgress(ctx.root).settings;
  const level = st.level === 'custom' ? st.levelBase : st.level;
  // No level chosen yet: keep Claude's order.
  const ordered = ORDER[level] ? orderRecs(recs, level) : recs;
  writeJsVar(ownItPath(ctx.root, 'recs.js'), 'OWNIT_RECS', ordered);
  return { count: ordered.length };
}
