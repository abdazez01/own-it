import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, '..', 'own-it', 'assets', 'engine', 'tokens.css'), 'utf8');

// Parse "--name: value;" declarations (first occurrence wins).
const tokens = {};
for (const m of css.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
  if (!(m[1] in tokens)) tokens[m[1]] = m[2].trim();
}

function parseColor(value) {
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  const rgba = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(value);
  if (rgba) return { r: +rgba[1], g: +rgba[2], b: +rgba[3], a: rgba[4] === undefined ? 1 : +rgba[4] };
  throw new Error(`cannot parse color: ${value}`);
}

function color(name) {
  assert.ok(name in tokens, `token --${name} missing from tokens.css`);
  return parseColor(tokens[name]);
}

function over(fg, bg) {
  return {
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  };
}

function lum(c) {
  const f = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}

function ratio(a, b) {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const night = () => color('night');
const solid = (name) => over(color(name), night());

test('tokens match the Graphite gold palette', () => {
  const expected = {
    night: '#111214', 'tile-solid': '#1A1B1F', ink: '#F5F3EE', 'ink-2': '#CFCBC2',
    gold: '#E8C26A', 'gold-ink': '#1E1500', sage: '#8FD3A8', 'sage-ink': '#0E2416',
    salmon: '#F08A7A', steel: '#5A7BA8', navy: '#3E5578',
  };
  for (const [k, v] of Object.entries(expected)) assert.equal(tokens[k].toUpperCase(), v, `--${k}`);
  assert.equal(tokens.tile, 'rgba(26,27,31,.86)');
  assert.equal(tokens.glass, 'rgba(240,240,245,.06)');
  assert.equal(tokens['glass-hi'], 'rgba(240,240,245,.12)');
  assert.equal(tokens['glass-deep'], 'rgba(10,11,13,.55)');
  assert.equal(tokens.edge, 'rgba(235,235,240,.16)');
  assert.equal(tokens.hinge, 'rgba(0,0,0,.65)');
});

const textPairs = [
  ['ink on glass-deep', 'ink', 'glass-deep'],
  ['ink-2 on glass-deep', 'ink-2', 'glass-deep'],
  ['ink on glass', 'ink', 'glass'],
  ['ink-2 on glass', 'ink-2', 'glass'],
  ['ink on glass-hi', 'ink', 'glass-hi'],
  ['ink-2 on glass-hi', 'ink-2', 'glass-hi'],
  ['ink on tile', 'ink', 'tile'],
  ['gold on glass-deep', 'gold', 'glass-deep'],
  ['sage on glass-deep', 'sage', 'glass-deep'],
  ['salmon on glass-deep', 'salmon', 'glass-deep'],
  ['gold-ink on gold', 'gold-ink', 'gold'],
  ['sage-ink on sage', 'sage-ink', 'sage'],
  ['gold-ink on salmon (alert flap tile)', 'gold-ink', 'salmon'],
];

for (const [label, fg, bg] of textPairs) {
  test(`contrast >= 4.5: ${label}`, () => {
    const r = ratio(solid(fg), solid(bg));
    assert.ok(r >= 4.5, `${label} is ${r.toFixed(2)}:1`);
  });
}

test('contrast on the reduced-transparency solid fill', () => {
  for (const bg of ['glass-solid', 'glass-hi-solid', 'glass-deep-solid']) {
    const fill = parseColor(tokens[bg]);
    for (const fg of ['ink', 'ink-2', 'gold', 'sage', 'salmon']) {
      const r = ratio(solid(fg), fill);
      assert.ok(r >= 4.5, `${fg} on ${bg} is ${r.toFixed(2)}:1`);
    }
  }
});

test('spec reference ratios hold (ink ~15:1, ink-2 ~10:1 on glass-deep)', () => {
  assert.ok(ratio(solid('ink'), solid('glass-deep')) >= 14);
  assert.ok(ratio(solid('ink-2'), solid('glass-deep')) >= 9.5);
});
