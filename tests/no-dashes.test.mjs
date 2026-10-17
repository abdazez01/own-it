import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { SKILL_DIR } from '../own-it/scripts/lib/paths.mjs';

// UI copy and skill docs use no em or en dashes (U+2014, U+2013).
const DASH = /[—–]/;
const TEXT = /\.(md|js|json|css|html|svg)$/;

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (TEXT.test(name)) out.push(p);
  }
  return out;
}

test('no em or en dashes in assets, references or SKILL.md', () => {
  const files = [...walk(join(SKILL_DIR, 'assets')), ...walk(join(SKILL_DIR, 'references')), join(SKILL_DIR, 'SKILL.md')];
  assert.ok(files.length > 20, 'found files to scan');
  const hits = [];
  for (const f of files) {
    readFileSync(f, 'utf8').split(/\r?\n/).forEach((line, i) => {
      if (DASH.test(line)) hits.push(`${relative(SKILL_DIR, f).replace(/\\/g, '/')}:${i + 1}`);
    });
  }
  assert.deepEqual(hits, []);
});
