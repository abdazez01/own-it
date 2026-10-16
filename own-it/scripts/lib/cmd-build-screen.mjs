import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join, isAbsolute } from 'node:path';
import { sanitize, decodeEntities } from './sanitize.mjs';
import { loadModel } from './model.mjs';
import { hashesFor } from './hash.mjs';
import { writeJsVar } from './json.mjs';
import { ownItPath, toPosix } from './paths.mjs';

const MAX_BYTES = 60 * 1024;
const MAX_SCREENS = 8;
const MIN_ENV_VALUE = 6;
const REGISTRY_PREFIX = 'window.OWNIT_SCREENS = ';

export function readScreens(root) {
  const p = ownItPath(root, 'screens.js');
  if (!existsSync(p)) return {};
  const text = readFileSync(p, 'utf8').trim();
  try {
    if (!text.startsWith(REGISTRY_PREFIX)) throw new Error('prefix');
    const v = JSON.parse(text.slice(REGISTRY_PREFIX.length).replace(/;$/, ''));
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('shape');
    return v;
  } catch { throw new Error(`invalid screens registry ${p}`); }
}

// Values from the project's .env* files, as [key, value]. Short values are skipped: they match everything.
function envValues(root) {
  const out = [];
  for (const e of readdirSync(root, { withFileTypes: true })) {
    if (!e.isFile() || !e.name.startsWith('.env')) continue;
    let text;
    try { text = readFileSync(join(root, e.name), 'utf8'); } catch { continue; }
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_.]*)\s*=\s*(.*?)\s*$/);
      if (!m) continue;
      const v = m[2].replace(/^(["'])([\s\S]*)\1$/, '$2');
      if (v.length >= MIN_ENV_VALUE) out.push([m[1], v]);
    }
  }
  return out;
}

// What looks like real data in the sanitized copy. Never echoes env values, only their key names.
function realDataFindings(root, html) {
  const found = [];
  const flat = html.replace(/data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]*/gi, 'data:image');
  const hay = `${flat}\n${decodeEntities(flat)}`;
  const emails = hay.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g) || [];
  for (const m of new Set(emails)) found.push(`email ${m}`);
  const uuids = hay.match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi) || [];
  for (const m of new Set(uuids)) found.push(`uuid ${m}`);
  const hex = hay.match(/[0-9a-fA-F]{24,}/g) || [];
  for (const m of new Set(hex)) found.push(`hex run ${m.slice(0, 8)}...`);
  const b64 = (hay.match(/[A-Za-z0-9+/=]{24,}/g) || []).filter((m) => /[A-Za-z]/.test(m) && /[0-9]/.test(m) && !/^[0-9a-fA-F]+$/.test(m));
  for (const m of new Set(b64)) found.push(`base64-like run ${m.slice(0, 8)}...`);
  for (const [key, value] of envValues(root)) if (hay.includes(value)) found.push(`value of ${key} from .env`);
  return found;
}

export async function run(args, ctx) {
  const [screenId, arg] = args._;
  const zoneId = args.flags.zone;
  const inputsFlag = args.flags.inputs;
  if (!screenId || !arg || typeof zoneId !== 'string' || typeof inputsFlag !== 'string') {
    throw new Error('usage: build-screen <screenId> <file> --zone <z> --inputs <comma files>');
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(screenId)) throw new Error(`invalid screen id "${screenId}"`);

  const model = loadModel(ctx.root);
  if (!Object.hasOwn(model.zones, zoneId)) throw new Error(`unknown zone "${zoneId}"`);

  const inputs = [...new Set(inputsFlag.split(',').map((s) => toPosix(s.trim())).filter(Boolean))];
  if (!inputs.length) throw new Error('--inputs needs at least one file');
  for (const f of inputs) {
    if (isAbsolute(f) || f.split('/').includes('..')) throw new Error(`input must be a project-relative path: ${f}`);
  }

  const file = resolve(ctx.root, arg);
  let raw;
  try { raw = readFileSync(file); } catch { throw new Error(`missing file ${file}`); }
  if (raw.length > MAX_BYTES) throw new Error(`screen too large: ${raw.length} bytes (max ${MAX_BYTES})`);

  const { html, dropped } = sanitize(raw.toString('utf8').replace(/^﻿/, ''));
  const bytes = Buffer.byteLength(html);
  if (bytes > MAX_BYTES) throw new Error(`screen too large: ${bytes} bytes (max ${MAX_BYTES})`);

  const findings = realDataFindings(ctx.root, html);
  if (findings.length) throw new Error(`screen looks like real data: ${findings.join('; ')}`);

  const byId = new Map((model.zones[zoneId].items || []).map((x) => [x.id, x]));
  const bad = [...new Set([...html.matchAll(/ data-ownit="([^"]*)"/g)].map((m) => m[1]))]
    .filter((id) => !(byId.has(id) && (byId.get(id).k === 'element' || byId.get(id).k === 'surface')));
  if (bad.length) throw new Error(`data-ownit ids not an element or surface in zone "${zoneId}": ${bad.join(', ')}`);

  const screens = readScreens(ctx.root);
  const others = Object.entries(screens).filter(([id, s]) => id !== screenId && s && s.zone === zoneId);
  if (others.length >= MAX_SCREENS) throw new Error(`zone "${zoneId}" already has ${MAX_SCREENS} screens`);

  const { git, hashes } = hashesFor(ctx.root, inputs);
  const missing = inputs.filter((f) => hashes[f] === null);
  if (missing.length) throw new Error(`inputs not found${git ? ' in git HEAD' : ''}: ${missing.join(', ')}`);

  // All validation done; write.
  mkdirSync(ownItPath(ctx.root, 'screens'), { recursive: true });
  writeFileSync(ownItPath(ctx.root, 'screens', `${screenId}.html`), html);
  screens[screenId] = { zone: zoneId, html, inputs: hashes };
  writeJsVar(ownItPath(ctx.root, 'screens.js'), 'OWNIT_SCREENS', screens);
  return { id: screenId, bytes, dropped };
}
