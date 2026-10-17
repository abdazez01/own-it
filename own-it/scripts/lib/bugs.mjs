import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { ownItPath } from './paths.mjs';

const one = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

// .own-it/bugs.md: every weakness the break passes kept, across all zones, for the user to fix after the session.
// Rewritten from the model each time, so it never lists a weakness check-refs has dropped. No weaknesses: no file.
export function writeBugs(root, model) {
  const path = ownItPath(root, 'bugs.md');
  const zones = Object.entries(model.zones).filter(([, z]) => (z.weaknesses || []).length);
  if (!zones.length) { rmSync(path, { force: true }); return 0; }
  const out = ['# Bugs own-it found', '', 'Found by reading your code. own-it never edits it: fix these after the session.', ''];
  let n = 0;
  for (const [id, z] of zones) {
    out.push(`## ${one(z.name) || id}`, '');
    for (const w of z.weaknesses) {
      n++;
      out.push(`### ${n}. ${one(w.text)}`, '', `- **Kind:** ${w.kind}`, `- **Why:** ${one(w.why)}`, `- **Where:** \`${w.ref}\``);
      if (w.fix) out.push(`- **How to fix:** ${one(w.fix)}`);
      out.push('');
    }
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, out.join('\n'));
  return n;
}
