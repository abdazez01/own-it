import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { SKILL_DIR } from '../own-it/scripts/lib/paths.mjs';
import { listGames } from '../own-it/scripts/lib/games.mjs';

// Code fences count toward the budget like prose.
const words = (s) => s.split(/\s+/).filter(Boolean).length;
const REFS = ['onboarding.md', 'extraction.md', 'rungs.md', 'grading.md', 'bosses.md', 'examples.md', 'games.md', 'models.md', 'screens.md'];
const read = (...p) => readFileSync(join(SKILL_DIR, ...p), 'utf8');

test('SKILL.md frontmatter and body budget', () => {
  const s = read('SKILL.md');
  const m = s.match(/^---\r?\nname: own-it\r?\ndescription: (.+?)\r?\n---\r?\n([\s\S]*)$/);
  assert.ok(m, 'frontmatter');
  assert.equal(m[1], 'Use when user runs /own-it or asks to be quizzed on, explain, or defend code they shipped');
  assert.ok(words(m[2]) <= 150, `SKILL.md body has ${words(m[2])} words`);
  for (const f of REFS) assert.ok(m[2].includes(f), `phase table mentions ${f}`);
  for (const rule of ['hand-edit', 'never fix', 'fork check', 'one line'])
    assert.ok(m[2].toLowerCase().includes(rule), `hard rule: ${rule}`);
});

test('reference budgets and set of files', () => {
  const dir = join(SKILL_DIR, 'references');
  assert.deepEqual(readdirSync(dir).sort(), [...REFS].sort());
  for (const f of REFS) {
    const s = read('references', f);
    if (f === 'examples.md') assert.ok(s.split(/\r?\n/).length <= 90, `${f} lines`);
    else if (f === 'models.md') assert.ok(words(s) <= 150, `${f} has ${words(s)} words`);
    else assert.ok(words(s) <= 400, `${f} has ${words(s)} words`);
  }
});

test('no em or en dashes anywhere in the docs', () => {
  for (const f of ['SKILL.md', ...REFS.map((r) => `references/${r}`)])
    assert.ok(!/[\u2013\u2014]/.test(read(...f.split('/'))), `${f} has a dash`);
});

test('onboarding keeps the startup order and the storage notice', () => {
  const s = read('references', 'onboarding.md');
  const at = ['Fork check', 'Everything own-it creates is stored in the `.own-it/` folder', 'node --version', 'scan', 'build-recs', 'serve', 'open', 'wait'].map((k) => s.indexOf(k));
  assert.ok(at.every((i) => i >= 0), `missing step: ${at}`);
  assert.deepEqual([...at].sort((a, b) => a - b), at, 'steps out of order');
  assert.ok(s.includes('Still here. Click in the page or type here.'));
  for (const ev of ['`pick`', '`result`', '`ask`']) assert.ok(s.includes(ev), ev);
});

test('games.md lists every game with its stage', () => {
  const s = read('references', 'games.md');
  for (const g of listGames()) {
    assert.ok(s.includes(`\`${g.id}\``), `games.md lacks ${g.id}`);
    assert.ok(new RegExp(`\`${g.id}\`[^\n]*${g.stage.replace('.', '\.')}`).test(s), `${g.id} stage ${g.stage}`);
  }
});

test('commands named in the docs exist', () => {
  const all = ['SKILL.md', ...REFS.map((r) => `references/${r}`)].map((f) => read(...f.split('/'))).join('\n');
  for (const c of ['build-feedback', 'build-round', 'build-screen', 'build-recs', 'wait', 'serve']) assert.ok(all.includes(c), c);
});
