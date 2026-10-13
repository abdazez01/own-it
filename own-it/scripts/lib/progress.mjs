import { readJson, writeJson, writeJsVar } from './json.mjs';
import { ownItPath } from './paths.mjs';

export const RUNGS = ['words', 'map', 'trace', 'break', 'boss'];

export const defaultZoneProgress = (name) => ({
  name,
  rungs: { words: 'open', map: 'locked', trace: 'locked', break: 'locked', boss: 'locked' },
  claimHashes: {},
  surfacesCovered: [],
  claimed: false,
  fogged: false,
  weakSpots: [],
});

export const defaultProgress = () => ({
  version: 1,
  xp: 0,
  badges: [],
  curiosity: 0,
  fogClears: 0,
  seq: 0,
  zones: {},
  finalBoss: 'locked',
  tokens: [],
  applied: [],
  settings: { gitTracked: false, downloadDir: null },
});

export function loadProgress(root) {
  const p = readJson(ownItPath(root, 'progress.json'), defaultProgress());
  if (!Array.isArray(p.applied)) p.applied = [];
  return p;
}

export function saveProgress(root, p) {
  writeJson(ownItPath(root, 'progress.json'), p);
  writeJsVar(ownItPath(root, 'progress.js'), 'OWNIT_PROGRESS', p);
}
