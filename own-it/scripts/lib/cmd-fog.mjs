import { loadModel, zoneFiles } from './model.mjs';
import { hashesFor } from './hash.mjs';
import { readScreens } from './cmd-build-screen.mjs';
import { loadProgress, saveProgress, RUNGS, defaultZoneProgress } from './progress.mjs';

const MAX_STALE = 20;
const RUNG_CHAR = { cleared: 'c', open: 'o' };

export async function run(_args, ctx) {
  const model = loadModel(ctx.root);
  const progress = loadProgress(ctx.root);
  const zones = [];
  let weak = 0;

  const ids = Object.keys(model.zones);
  const filesOf = new Map(ids.map((id) => [id, zoneFiles(ctx.root, model.zones[id])]));
  const claimedOf = (id) => Object.values(progress.zones[id]?.claimHashes || {}).flatMap((h) => Object.keys(h));
  const screens = readScreens(ctx.root);
  const screenFiles = Object.values(screens).flatMap((s) => Object.keys(s?.inputs || {}));
  const all = new Set([...ids.flatMap((id) => [...filesOf.get(id), ...claimedOf(id)]), ...screenFiles]);
  const now = hashesFor(ctx.root, [...all]);
  const git = now.git;

  for (const id of ids) {
    const mz = model.zones[id];
    const pz = Object.hasOwn(progress.zones, id) ? progress.zones[id] : defaultZoneProgress(mz.name);
    const stored = mz.files || {};
    const files = filesOf.get(id);

    const stale = files.filter((f) => now.hashes[f] !== null && now.hashes[f] !== stored[f]);
    // Files whose committed content moved since a rung was claimed. Unlike `stale`, this
    // survives re-extraction and only resets when a refresh mission re-stamps claimHashes.
    const changed = [...new Set(Object.values(pz.claimHashes || {})
      .flatMap((h) => Object.entries(h).filter(([f, hash]) => now.hashes[f] !== hash).map(([f]) => f)))].sort();
    const fogged = now.git && changed.length > 0;

    if (Object.hasOwn(progress.zones, id)) pz.fogged = fogged;
    weak += (pz.weakSpots || []).length;
    const zone = {
      id, name: mz.name,
      rungs: RUNGS.map((r) => RUNG_CHAR[pz.rungs?.[r]] || '-').join(''),
      fogged,
      stale: stale.slice(0, MAX_STALE),
      staleScreens: Object.entries(screens)
        .filter(([, s]) => s?.zone === id && Object.entries(s.inputs || {}).some(([f, h]) => now.hashes[f] !== h))
        .map(([sid]) => sid),
    };
    if (fogged) zone.changed = changed.slice(0, MAX_STALE);
    zones.push(zone);
  }

  saveProgress(ctx.root, progress);
  return { git, xp: progress.xp, badges: progress.badges.length, weak, zones };
}
