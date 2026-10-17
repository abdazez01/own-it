import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

export function readJson(path, fallback) {
  if (!existsSync(path)) {
    if (fallback !== undefined) return fallback;
    throw new Error(`missing file ${path}`);
  }
  try { return JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, '')); }
  catch { throw new Error(`invalid JSON in ${path}`); }
}

export function writeJson(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path + '.tmp', JSON.stringify(data, null, 1));
  renameSync(path + '.tmp', path);
}

export function writeJsVar(path, name, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `window.${name} = ${JSON.stringify(data)};\n`);
}

// Registry form: window.<name>=window.<name>||{};window.<name>[<key>]=<json>; so several data files can coexist.
export function writeJsRegistry(path, name, key, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `window.${name}=window.${name}||{};window.${name}[${JSON.stringify(key)}]=${JSON.stringify(data)};
`);
}
