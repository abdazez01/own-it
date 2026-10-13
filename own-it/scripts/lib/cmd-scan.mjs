import { readFileSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { SKILL_DIR } from './paths.mjs';
import { readJson } from './json.mjs';
import { listFiles } from './walk.mjs';
import { loadModel, zoneFiles } from './model.mjs';

const MAX_CANDIDATES = 300;
const MAX_TERMS = 60;
const MAX_REFS = 3;

const readText = (root, f) => { try { return readFileSync(join(root, f), 'utf8'); } catch { return ''; } };

function detectFrameworks(root, files, frameworks) {
  const npmDeps = new Set();
  let pipText = '';
  let gemText = '';
  for (const f of files) {
    const name = basename(f);
    if (name === 'package.json') {
      try {
        const pkg = JSON.parse(readText(root, f));
        for (const k of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) npmDeps.add(k);
      } catch { /* unparsable package.json: ignore */ }
    } else if (name === 'requirements.txt' || name === 'pyproject.toml') pipText += readText(root, f).toLowerCase() + '\n';
    else if (name === 'Gemfile') gemText += readText(root, f).toLowerCase() + '\n';
  }
  return Object.entries(frameworks).filter(([, fw]) => {
    const d = fw.detect || {};
    return (d.npm || []).some((p) => npmDeps.has(p))
      || (d.pip || []).some((p) => pipText.includes(p.toLowerCase()))
      || (d.gem || []).some((p) => gemText.includes(p.toLowerCase()))
      || (d.files || []).some((s) => files.some((f) => f.endsWith(s)));
  }).map(([name]) => name);
}

const compile = (pats) => pats.map((p) => ({ ...p, rx: new RegExp(p.re, 'g') }));
const applies = (p, ext) => !p.ext || p.ext.includes(ext.toLowerCase());

function buildLabel(p, m) {
  return p.label.replace(/\$([1-9])/g, (_, i) => {
    const v = m[Number(i)] ?? '';
    return i === '1' && p.upper1 ? v.toUpperCase() : v;
  });
}

function dirKey(f) {
  const segs = f.split('/');
  return segs.length === 1 ? '.' : segs.slice(0, Math.min(2, segs.length - 1)).join('/');
}

function scanCandidates(root, files, patterns) {
  const pats = compile(patterns);
  const seen = new Set();
  const candidates = [];
  let truncated = false;
  for (const f of files) {
    const mine = pats.filter((p) => applies(p, extname(f)));
    if (!mine.length) continue;
    const lines = readText(root, f).split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      for (const p of mine) {
        for (const m of lines[i].matchAll(p.rx)) {
          const c = { k: p.k, label: buildLabel(p, m), ref: `${f}:${i + 1}` };
          const key = `${c.k}|${c.label}|${c.ref}`;
          if (seen.has(key)) continue;
          seen.add(key);
          if (candidates.length >= MAX_CANDIDATES) { truncated = true; continue; }
          candidates.push(c);
        }
      }
    }
  }
  return { candidates, truncated };
}

function scanStrings(root, files, patterns) {
  const pats = compile(patterns);
  const terms = new Map();
  for (const f of files) {
    const mine = pats.filter((p) => applies(p, extname(f)));
    if (!mine.length) continue;
    const lines = readText(root, f).split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      for (const p of mine) {
        for (const m of lines[i].matchAll(p.rx)) {
          const t = (m[1] ?? '').trim();
          if (!t) continue;
          let e = terms.get(t);
          if (!e) terms.set(t, (e = { t, kind: p.kind, n: 0, refs: [] }));
          e.n++;
          const ref = `${f}:${i + 1}`;
          if (e.refs.length < MAX_REFS && !e.refs.includes(ref)) e.refs.push(ref);
        }
      }
    }
  }
  return [...terms.values()].sort((a, b) => b.n - a.n || (a.t < b.t ? -1 : a.t > b.t ? 1 : 0)).slice(0, MAX_TERMS);
}

export async function run(args, ctx) {
  const { root } = ctx;
  const patterns = readJson(join(SKILL_DIR, 'assets', 'patterns.json'));
  const zoneId = args.flags.strings;
  if (zoneId !== undefined) {
    const zones = loadModel(root).zones;
    const zone = Object.hasOwn(zones, zoneId) ? zones[zoneId] : undefined;
    if (!zone) throw new Error(`unknown zone "${zoneId}"; run init --zones first`);
    return { zone: zoneId, terms: scanStrings(root, zoneFiles(root, zone), patterns.strings) };
  }
  const files = listFiles(root);
  const frameworks = detectFrameworks(root, files, patterns.frameworks);
  const active = [...frameworks.flatMap((n) => patterns.frameworks[n].patterns), ...patterns.generic];
  const dirs = {};
  for (const f of files) { const d = dirKey(f); dirs[d] = (dirs[d] || 0) + 1; }
  const { candidates, truncated } = scanCandidates(root, files, active);
  return { frameworks, fileCount: files.length, dirs, candidates, truncated };
}
