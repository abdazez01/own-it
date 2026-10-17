import { existsSync, copyFileSync, cpSync, appendFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { readJson, writeJsVar, writeAggregate } from './json.mjs';
import { listGames } from './games.mjs';
import { ownItPath, SKILL_DIR } from './paths.mjs';
import { check, ZONES } from './validate.mjs';
import { loadModel, saveModel } from './model.mjs';
import { loadProgress, saveProgress, defaultZoneProgress } from './progress.mjs';

const FILES = ['game.html', 'core.js'];
const DIRS = ['engine', 'games', 'brand'];

export async function run(args, ctx) {
  const zf = args.flags.zones;
  if (!zf || zf === true) throw new Error('--zones <file> is required');
  const spec = readJson(resolve(ctx.root, zf));
  const errs = check(spec, ZONES);
  if (errs.length) throw new Error(`invalid zones file: ${errs.slice(0, 5).join('; ')}`);

  const seen = new Set();
  for (const z of spec.zones) {
    if (seen.has(z.id)) throw new Error(`invalid zones file: duplicate zone id "${z.id}"`);
    seen.add(z.id);
  }

  const gitTracked = Boolean(args.flags['git-tracked']);
  const created = !existsSync(ownItPath(ctx.root, 'progress.json'));
  mkdirSync(ownItPath(ctx.root), { recursive: true });

  for (const f of FILES) {
    const src = join(SKILL_DIR, 'assets', f);
    if (existsSync(src)) copyFileSync(src, ownItPath(ctx.root, f));
  }
  for (const d of DIRS) {
    const src = join(SKILL_DIR, 'assets', d);
    if (existsSync(src)) cpSync(src, ownItPath(ctx.root, d), { recursive: true });
  }
  // The page learns about the games from this generated registry (no fetch of JSON, so file:// works).
  const registry = ownItPath(ctx.root, 'games', 'registry.js');
  writeJsVar(registry, 'OWNIT_GAMES', listGames());
  // The project root lets the page turn file:line refs into editor links.
  appendFileSync(registry, `window.OWNIT_ROOT = ${JSON.stringify(resolve(ctx.root).split('\\').join('/'))};\n`);
  // Empty registries the page always loads; build-round and build-feedback regenerate them.
  const dataDir = ownItPath(ctx.root, 'data');
  if (!existsSync(ownItPath(ctx.root, 'rounds.js'))) writeAggregate(dataDir, ownItPath(ctx.root, 'rounds.js'), 'OWNIT_ROUNDS', (f) => !f.startsWith('feedback-'));
  if (!existsSync(ownItPath(ctx.root, 'feedback.js'))) writeAggregate(dataDir, ownItPath(ctx.root, 'feedback.js'), 'OWNIT_FEEDBACK', (f) => f.startsWith('feedback-'));
  const ignore = ownItPath(ctx.root, '.gitignore');
  if (gitTracked) rmSync(ignore, { force: true });
  else writeFileSync(ignore, '*\n');

  const model = loadModel(ctx.root);
  const progress = loadProgress(ctx.root);
  const oldModelZones = model.zones;
  const oldProgressZones = progress.zones;
  model.zones = {};
  progress.zones = {};
  for (const z of spec.zones) {
    const prevM = Object.hasOwn(oldModelZones, z.id) ? oldModelZones[z.id] : null;
    const prevP = Object.hasOwn(oldProgressZones, z.id) ? oldProgressZones[z.id] : null;
    model.zones[z.id] = prevM
      ? { files: {}, items: [], ...prevM, name: z.name, paths: z.paths }
      : { name: z.name, paths: z.paths, files: {}, items: [] };
    progress.zones[z.id] = prevP
      ? { ...prevP, name: z.name }
      : defaultZoneProgress(z.name);
  }
  progress.settings.gitTracked = gitTracked;
  saveModel(ctx.root, model);
  saveProgress(ctx.root, progress);
  return { created, zones: spec.zones.map((z) => z.id), gitTracked };
}
