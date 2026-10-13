import { readJson, writeJson } from './json.mjs';
import { ownItPath } from './paths.mjs';
import { listFiles } from './walk.mjs';

export const loadModel = (root) => readJson(ownItPath(root, 'model.json'), { version: 1, zones: {} });
export const saveModel = (root, m) => writeJson(ownItPath(root, 'model.json'), m);

export function matchesPath(file, prefix) {
  const p = prefix.replace(/\/+$/, '');
  if (file === p || file.startsWith(p + '/')) return true;
  const slash = file.lastIndexOf('/');
  const dot = file.lastIndexOf('.');
  const base = dot > slash ? file.slice(0, dot) : file;
  return base === p;
}
export const zoneFiles = (root, zone) => listFiles(root).filter((f) => zone.paths.some((p) => matchesPath(f, p)));
