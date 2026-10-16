import { readdirSync, readFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ownItPath } from './paths.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const INVALID_AFTER_MS = 10000;

function unseen(dir) {
  const seenFile = join(dir, '.seen');
  const seen = new Set(existsSync(seenFile) ? readFileSync(seenFile, 'utf8').split('\n').filter(Boolean) : []);
  let names;
  try { names = readdirSync(dir); } catch { return { seenFile, files: [] }; }
  const files = names.filter((n) => n.endsWith('.json') && !n.startsWith('.') && !seen.has(n))
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10) || (a < b ? -1 : 1));
  return { seenFile, files };
}

export async function run(args, ctx) {
  const timeout = Number(args.flags.timeout ?? 600);
  if (!(timeout >= 0)) throw new Error('invalid --timeout');
  const invalidAfter = ctx.invalidAfterMs ?? INVALID_AFTER_MS;
  const dir = ownItPath(ctx.root, 'inbox');
  mkdirSync(dir, { recursive: true });
  const deadline = Date.now() + timeout * 1000;
  const firstFailure = new Map();
  for (;;) {
    const { seenFile, files } = unseen(dir);
    for (const file of files) {
      let payload = null;
      try { payload = JSON.parse(readFileSync(join(dir, file), 'utf8')); } catch { /* retry next poll */ }
      if (payload === null || typeof payload !== 'object') {
        const since = firstFailure.get(file) ?? Date.now();
        firstFailure.set(file, since);
        if (Date.now() - since < invalidAfter) continue;
        payload = { type: 'invalid' };
      }
      appendFileSync(seenFile, file + '\n');
      return { ...payload, file };
    }
    if (Date.now() >= deadline) return { idle: true };
    await sleep(300);
  }
}
