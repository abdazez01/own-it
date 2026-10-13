import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { check, EXTRACTION, ITEM } from './validate.mjs';
import { loadModel, saveModel, zoneFiles } from './model.mjs';
import { hashesFor, lineCount } from './hash.mjs';
import { toPosix } from './paths.mjs';
import { loadProgress, saveProgress } from './progress.mjs';
import { estimate } from './tokens.mjs';

// EXTRACTION with per-item validation deferred, so bad items are dropped rather than fatal.
const TOP_LEVEL = { ...EXTRACTION, props: { ...EXTRACTION.props, items: { type: 'array', max: EXTRACTION.props.items.max } } };

const fileOf = (ref) => ref.slice(0, ref.lastIndexOf(':'));
const lineOf = (ref) => Number(ref.slice(ref.lastIndexOf(':') + 1));

function parseExtraction(path) {
  const raw = readFileSync(path, 'utf8').replace(/^FEFF/, '');
  try { return { raw, data: JSON.parse(raw) }; }
  catch { throw new Error(`invalid JSON in ${path}`); }
}

// Ids an item points at, per kind; null when a required pointer is absent.
function dependencies(item, kept) {
  const states = (ids) => ids.every((id) => kept.get(id)?.k === 'state');
  switch (item.k) {
    case 'edge': return item.from && item.to && [item.from, item.to].every((id) => kept.has(id));
    case 'transition': return item.from && item.to && states([item.from, item.to]);
    case 'flow': return (item.steps || []).flat().every((id) => kept.has(id));
    case 'failure': return Boolean(item.card) && kept.has(item.card);
    case 'permission': return Boolean(item.role) && kept.has(item.role);
    default: return true;
  }
}

export async function run(args, ctx) {
  const file = args._[0];
  if (!file) throw new Error('usage: check-refs <extraction.json>');
  const { raw, data: ex } = parseExtraction(resolve(ctx.root, file));

  const errs = check(ex, TOP_LEVEL);
  if (errs.length) throw new Error(`invalid extraction: ${errs.slice(0, 5).join('; ')}`);
  const model = loadModel(ctx.root);
  if (!Object.hasOwn(model.zones, ex.zone)) throw new Error(`unknown zone "${ex.zone}"`);
  const zone = model.zones[ex.zone];

  const inZone = new Set(zoneFiles(ctx.root, zone));
  const dropped = [];
  const drop = (id, why) => dropped.push({ id, why });
  const kept = new Map();

  for (const raw0 of ex.items) {
    const item = (raw0 && typeof raw0.ref === 'string') ? { ...raw0, ref: toPosix(raw0.ref) } : raw0;
    if (check(item, ITEM).length) { drop(item?.id, 'invalid'); continue; }
    if (kept.has(item.id)) { drop(item.id, 'dup-id'); continue; }
    const f = fileOf(item.ref);
    const abs = resolve(ctx.root, f);
    if (!existsSync(abs) || !statSync(abs).isFile()) { drop(item.id, 'no-file'); continue; }
    const line = lineOf(item.ref);
    if (line < 1 || line > lineCount(ctx.root, f)) { drop(item.id, 'bad-line'); continue; }
    if (!inZone.has(f) && item.outside !== true) { drop(item.id, 'outside-zone'); continue; }
    kept.set(item.id, item);
  }

  for (let changed = true; changed;) {
    changed = false;
    for (const [id, item] of kept) {
      if (!dependencies(item, kept)) { kept.delete(id); drop(id, 'dangling'); changed = true; }
    }
  }

  const reExtracted = new Set(ex.files.map(toPosix));
  const remaining = zone.items.filter((i) => !reExtracted.has(fileOf(i.ref)) && !kept.has(i.id));
  zone.items = [...remaining, ...kept.values()];
  zone.files = hashesFor(ctx.root, [...inZone]).hashes;
  saveModel(ctx.root, model);

  const est = estimate(raw);
  const progress = loadProgress(ctx.root);
  progress.tokens.push({ t: ctx.now().toISOString(), kind: 'extraction', zone: ex.zone, est });
  saveProgress(ctx.root, progress);

  return { zone: ex.zone, kept: kept.size, dropped, est };
}
