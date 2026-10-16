import { existsSync, unlinkSync } from 'node:fs';
import { ownItPath } from './paths.mjs';
import { readJson } from './json.mjs';

export async function run(_args, ctx) {
  const file = ownItPath(ctx.root, 'serve.json');
  if (existsSync(file)) {
    const s = readJson(file, null);
    if (s && Number.isInteger(s.pid) && s.pid !== process.pid) {
      try { process.kill(s.pid); } catch { /* already gone */ }
    }
    try { unlinkSync(file); } catch { /* already gone */ }
  }
  return { stopped: true };
}
