import { existsSync, unlinkSync } from 'node:fs';
import { ownItPath } from './paths.mjs';
import { readJson } from './json.mjs';
import { probeInstance } from './cmd-serve.mjs';

export async function run(_args, ctx) {
  const file = ownItPath(ctx.root, 'serve.json');
  if (!existsSync(file)) return { stopped: true };
  let s = null;
  try { s = readJson(file, null); } catch { /* corrupt file counts as stale */ }
  // Only kill the pid if the recorded port really answers with the recorded token.
  const ours = await probeInstance(s);
  if (ours && Number.isInteger(s.pid) && s.pid !== process.pid) {
    try { process.kill(s.pid); } catch { /* already gone */ }
  }
  try { unlinkSync(file); } catch { /* already gone */ }
  return ours ? { stopped: true } : { stopped: true, stale: true };
}
