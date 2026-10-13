import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { SKILL_DIR } from '../own-it/scripts/lib/paths.mjs';

const words = (s) => s.replace(/```[\s\S]*?```/g, (b) => b).split(/\s+/).filter(Boolean).length;

test('SKILL.md frontmatter and body budget', () => {
  const s = readFileSync(join(SKILL_DIR, 'SKILL.md'), 'utf8');
  const m = s.match(/^---\nname: own-it\ndescription: (.+)\n---\n([\s\S]*)$/);
  assert.ok(m, 'frontmatter');
  assert.equal(m[1], 'Use when user runs /own-it or asks to be quizzed on, explain, or defend code they shipped');
  assert.ok(words(m[2]) <= 150, `SKILL.md body has ${words(m[2])} words`);
  for (const f of ['onboarding.md', 'extraction.md', 'rungs.md', 'grading.md', 'bosses.md', 'examples.md'])
    assert.ok(m[2].includes(f), `phase table mentions ${f}`);
});

test('reference budgets', () => {
  const dir = join(SKILL_DIR, 'references');
  for (const f of readdirSync(dir)) {
    const s = readFileSync(join(dir, f), 'utf8');
    if (f === 'examples.md') assert.ok(s.split('\n').length <= 90, `${f} lines`);
    else assert.ok(words(s) <= 400, `${f} has ${words(s)} words`);
  }
});
