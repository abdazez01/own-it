import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readJson } from './json.mjs';
import { check } from './validate.mjs';
import { SKILL_DIR } from './paths.mjs';

export const GAMES_DIR = join(SKILL_DIR, 'assets', 'games');

const META = { type: 'object', required: ['id', 'name', 'rung', 'minutes', 'examReady', 'usesScreens', 'stage', 'line'], props: {
  id: { type: 'string', pattern: '^[a-z0-9-]{1,24}$' },
  name: { type: 'string', max: 40 },
  rung: { type: 'string', enum: ['words', 'map', 'trace', 'break', 'boss', 'none'] },
  minutes: { type: 'number', min: 2 },
  examReady: { type: 'boolean' },
  usesScreens: { type: 'boolean' },
  stage: { type: 'string', enum: ['2.0', '2.1', '2.2'] },
  line: { type: 'string', max: 140 } } };

// Reads every <id>.meta.json, validating each one. Returns the metas sorted by file name.
export function listGames(dir = GAMES_DIR) {
  return readdirSync(dir).filter((f) => f.endsWith('.meta.json')).sort().map((f) => {
    const meta = readJson(join(dir, f));
    const errs = check(meta, META);
    if (meta.id + '.meta.json' !== f) errs.push(`id: must match file name ${f}`);
    if (errs.length) throw new Error(`invalid game meta ${f}: ${errs.join('; ')}`);
    return meta;
  });
}

// Looks a game up by id with Object.hasOwn. Returns the meta, or null when unknown.
export function getGame(id, dir = GAMES_DIR) {
  const byId = Object.fromEntries(listGames(dir).map((g) => [g.id, g]));
  return Object.hasOwn(byId, id) ? byId[id] : null;
}
