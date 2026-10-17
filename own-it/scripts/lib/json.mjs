import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

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

// Reads one registry data file (written by writeJsRegistry) back into { key: value } without running it in the helper's realm.
export function readJsRegistry(path, name) {
  try {
    const sandbox = { window: {} };
    vm.runInNewContext(readFileSync(path, 'utf8'), sandbox, { timeout: 1000 });
    const v = sandbox.window[name];
    return v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : {};
  } catch { return {}; }
}

// Rebuilds the one-file registry the page loads on start: <out> = window.<name> = { every key of every data file chosen by `pick` }.
export function writeAggregate(dataDir, out, name, pick) {
  let files = [];
  try { files = readdirSync(dataDir).filter((f) => f.endsWith('.js') && pick(f)).sort(); } catch { /* no data yet */ }
  const all = {};
  for (const f of files) Object.assign(all, readJsRegistry(join(dataDir, f), name));
  writeFileSync(out, `window.${name} = ${JSON.stringify(all)};\n`);
}
