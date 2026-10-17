import { resolve } from 'node:path';
import { check, RECS } from './validate.mjs';
import { loadModel } from './model.mjs';
import { getGame } from './games.mjs';
import { readJson, writeJsVar } from './json.mjs';
import { ownItPath } from './paths.mjs';

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
  writeJsVar(ownItPath(ctx.root, 'recs.js'), 'OWNIT_RECS', recs);
  return { count: recs.length };
}
