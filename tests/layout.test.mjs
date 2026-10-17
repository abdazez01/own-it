import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../own-it/assets/engine/ui.css', import.meta.url), 'utf8');

test('wide shell scales with the viewport and stays centered', () => {
  assert.match(css, /@media \(min-width: 1600px\) \{ \.wrap \{ width: min\(92vw, 2200px\); \} \}/);
  assert.match(css, /\.wrap \{[^}]*margin: 0 auto/);
});

test('wide rules keep prose at 75ch or less and let the library fill', () => {
  assert.match(css, /max-width: 75ch/);
  assert.match(css, /\.lib \{ grid-template-columns: repeat\(auto-fill, minmax\(min\(clamp\(/);
  assert.match(css, /clamp\(16px, \.55vw \+ 7px, 20px\)/);
});

test('quests use a two-column layout on wide screens and a height-capped screen copy', () => {
  assert.match(css, /\.quest-area \{ grid-template-columns: minmax\(0, 3fr\) minmax\(0, 2fr\)/);
  const host = readFileSync(new URL('../own-it/assets/engine/screenhost.js', import.meta.url), 'utf8');
  assert.match(host, /opts\.reserve \|\| 350/);
});
