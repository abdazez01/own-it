import { loadModel, zoneFiles } from './model.mjs';
import { hashesFor } from './hash.mjs';
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
  const all = new Set(ids.flatMap((id) => [...filesOf.get(id), ...claimedOf(id)]));
  const now = hashesFor(ctx.root, [...all]);
  const git = now.git;

  for (const id of ids) {
    const mz = model.zones[id];
    const pz = Object.hasOwn(progress.zones, id) ? progress.zones[id] : defaultZoneProgress(mz.name);
    const stored = mz.files || {};
    const files = filesOf.get(id);

    const stale = files.filter((f) => now.hashes[f] !== null && now.hashes[f] !== stored[f]);
    const fogged = now.git && Object.values(pz.claimHashes || {})
      .some((h) => Object.entries(h).some(([f, hash]) => now.hashes[f] !== hash));

    if (Object.hasOwn(progress.zones, id)) pz.fogged = fogged;
    weak += (pz.weakSpots || []).length;
    zones.push({
      id, name: mz.name,
      rungs: RUNGS.map((r) => RUNG_CHAR[pz.rungs?.[r]] || '-').join(''),
      fogged,
      stale: stale.slice(0, MAX_STALE),
    });
  }

  saveProgress(ctx.root, progress);
  return { git, xp: progress.xp, badges: progress.badges.length, weak, zones };
}
