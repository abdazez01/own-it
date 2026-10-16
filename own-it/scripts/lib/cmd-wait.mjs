import { readdirSync, readFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ownItPath } from './paths.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function nextUnseen(dir) {
  const seenFile = join(dir, '.seen');
  const seen = new Set(existsSync(seenFile) ? readFileSync(seenFile, 'utf8').split('\n').filter(Boolean) : []);
  let names;
  try { names = readdirSync(dir); } catch { return null; }
  const file = names.filter((n) => n.endsWith('.json') && !seen.has(n))
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10) || (a < b ? -1 : 1))[0];
  return file ? { file, seenFile } : null;
}

export async function run(args, ctx) {
  const timeout = Number(args.flags.timeout ?? 600);
  if (!(timeout >= 0)) throw new Error('invalid --timeout');
  const dir = ownItPath(ctx.root, 'inbox');
  mkdirSync(dir, { recursive: true });
  const deadline = Date.now() + timeout * 1000;
  for (;;) {
    const hit = nextUnseen(dir);
    if (hit) {
      let payload;
      try { payload = JSON.parse(readFileSync(join(dir, hit.file), 'utf8')); } catch { payload = { type: 'invalid' }; }
      appendFileSync(hit.seenFile, hit.file + '\n');
      return { ...payload, file: hit.file };
    }
    if (Date.now() >= deadline) return { idle: true };
    await sleep(300);
  }
}
