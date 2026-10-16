import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
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
  const text = readFileSync(path, 'utf8');
  const raw = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
  try { return { raw, data: JSON.parse(raw) }; }
  catch { throw new Error(`invalid JSON in ${path}`); }
}

// Whether every id an item points at is present (and a state, for transitions).
function dependencies(item, kept) {
  const states = (ids) => ids.every((id) => kept.get(id)?.k === 'state');
  switch (item.k) {
    case 'edge': return Boolean(item.from && item.to) && [item.from, item.to].every((id) => kept.has(id));
    case 'transition': return Boolean(item.from && item.to) && states([item.from, item.to]);
    case 'flow': return (item.steps || []).flat().every((id) => kept.has(id));
    case 'failure': return Boolean(item.card) && kept.has(item.card);
    case 'element': {
      const is = (id, k) => kept.get(id)?.k === k;
      return is(item.on, 'surface') && (item.does === undefined || is(item.does, 'flow'))
        && (item.goes === undefined || is(item.goes, 'surface')) && (item.roles || []).every((id) => is(id, 'role'));
    }
    case 'permission': return Boolean(item.role) && kept.has(item.role);
    default: return true;
  }
}

// Root-relative POSIX path for a ref's file, or null when it escapes the project root.
function confine(root, file) {
  const rel = relative(root, resolve(root, file));
  if (rel === '' || isAbsolute(rel) || /^\.\.(?:[\\/]|$)/.test(rel)) return null;
  return toPosix(rel);
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

  const firstExtraction = zone.items.length === 0;
  const inZone = new Set(zoneFiles(ctx.root, zone));
  const dropped = [];
  const drop = (id, why) => dropped.push({ id, why });
  const incoming = new Map();
  const seen = new Set();

  for (const raw0 of ex.items) {
    const item = (raw0 && typeof raw0.ref === 'string') ? { ...raw0, ref: toPosix(raw0.ref) } : raw0;
    if (check(item, ITEM).length) { drop(item?.id, 'invalid'); continue; }
    if (seen.has(item.id)) { drop(item.id, 'dup-id'); continue; }
    seen.add(item.id);
    const f = confine(ctx.root, fileOf(item.ref));
    const abs = f && resolve(ctx.root, f);
    if (!f || !existsSync(abs) || !statSync(abs).isFile()) { drop(item.id, 'no-file'); continue; }
    const line = lineOf(item.ref);
    if (line < 1 || line > lineCount(ctx.root, f)) { drop(item.id, 'bad-line'); continue; }
    if (!inZone.has(f) && item.outside !== true) { drop(item.id, 'outside-zone'); continue; }
    incoming.set(item.id, { ...item, ref: `${f}:${line}` });
  }

  // Integrity runs over the merged set: surviving existing items plus incoming ones.
  const reExtracted = new Set(ex.files.map(toPosix));
  const merged = new Map();
  for (const i of zone.items) if (!reExtracted.has(fileOf(i.ref)) && !incoming.has(i.id)) merged.set(i.id, i);
  for (const [id, i] of incoming) merged.set(id, i);
  for (let changed = true; changed;) {
    changed = false;
    for (const [id, item] of merged) {
      if (!dependencies(item, merged)) { merged.delete(id); incoming.delete(id); drop(id, 'dangling'); changed = true; }
    }
  }

  zone.items = [...merged.values()];
  // Partial re-extraction only re-stamps what was re-read, so changes elsewhere stay detectable as stale.
  const stamp = firstExtraction ? [...inZone] : [...reExtracted];
  zone.files = { ...(firstExtraction ? {} : zone.files), ...hashesFor(ctx.root, stamp).hashes };
  saveModel(ctx.root, model);

  const est = estimate(raw);
  const progress = loadProgress(ctx.root);
  progress.tokens.push({ t: ctx.now().toISOString(), kind: 'extraction', zone: ex.zone, est });
  saveProgress(ctx.root, progress);

  return { zone: ex.zone, kept: incoming.size, dropped, est };
}
