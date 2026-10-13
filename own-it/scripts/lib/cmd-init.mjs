import { existsSync, copyFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { readJson } from './json.mjs';
import { ownItPath, SKILL_DIR } from './paths.mjs';
import { check, ZONES } from './validate.mjs';
import { loadModel, saveModel } from './model.mjs';
import { loadProgress, saveProgress, defaultZoneProgress } from './progress.mjs';

const ASSETS = ['game.html', 'core.js'];

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

  for (const f of ASSETS) {
    const src = join(SKILL_DIR, 'assets', f);
    if (existsSync(src)) copyFileSync(src, ownItPath(ctx.root, f));
  }
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
