import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { run as init } from '../own-it/scripts/lib/cmd-init.mjs';
import { run as checkRefs } from '../own-it/scripts/lib/cmd-check-refs.mjs';
import { loadModel } from '../own-it/scripts/lib/model.mjs';
import { loadProgress } from '../own-it/scripts/lib/progress.mjs';
import { blobHash } from '../own-it/scripts/lib/hash.mjs';
import { tmpProject, ctx } from './helpers.mjs';

async function setup() {
  const root = tmpProject({ 'api/trips.ts': 'a\nb\nc\nd\n', 'app/Trip.tsx': 'x\r\ny\r\n', 'other/z.ts': 'z\n' });
  writeFileSync(join(root, 'zones.json'), JSON.stringify({ zones: [{ id: 'trips', name: 'Trips', paths: ['api', 'app'] }] }));
  await init({ _: [], flags: { zones: join(root, 'zones.json') } }, ctx(root));
  return root;
}
function write(root, obj) { const p = join(root, 'ex.json'); writeFileSync(p, JSON.stringify(obj)); return p; }
const it = (o) => ({ conf: 'high', ...o });

test('keeps valid items, drops bad file, bad line, dangling edges, outside-zone, invalid, dup', async () => {
  const root = await setup();
  const p = write(root, { zone: 'trips', files: ['api/trips.ts', 'app/Trip.tsx'], items: [
    it({ id: 'c1', k: 'surface', label: 'POST /cancel', ref: 'api/trips.ts:2', actor: 'Backend' }),
    it({ id: 'c2', k: 'surface', label: 'Trip screen', ref: 'app\\Trip.tsx:2', actor: 'Driver app' }),
    it({ id: 'c3', k: 'surface', label: 'ghost', ref: 'api/nope.ts:1' }),
    it({ id: 'c4', k: 'surface', label: 'far', ref: 'api/trips.ts:99' }),
    it({ id: 'e1', k: 'edge', from: 'c2', to: 'c1', ref: 'app/Trip.tsx:1' }),
    it({ id: 'e2', k: 'edge', from: 'c2', to: 'c3', ref: 'app/Trip.tsx:1' }),
    it({ id: 'c5', k: 'surface', label: 'z', ref: 'other/z.ts:1' }),
    { id: 'c6', k: 'surface', label: 'no conf', ref: 'api/trips.ts:1' },
    it({ id: 'c1', k: 'surface', label: 'dup', ref: 'api/trips.ts:1' }),
  ] });
  const out = await checkRefs({ _: [p], flags: {} }, ctx(root));
  assert.equal(out.zone, 'trips');
  assert.equal(out.kept, 3);
  const why = Object.fromEntries(out.dropped.map((d) => [d.id + (d.why === 'dup-id' ? '#dup' : ''), d.why]));
  assert.deepEqual(why, { c3: 'no-file', c4: 'bad-line', e2: 'dangling', c5: 'outside-zone', c6: 'invalid', 'c1#dup': 'dup-id' });
  const m = loadModel(root).zones.trips;
  assert.deepEqual(m.items.map((i) => i.id), ['c1', 'c2', 'e1']);
  assert.equal(m.items[1].ref, 'app/Trip.tsx:2');
  assert.equal(m.files['api/trips.ts'], blobHash('a\nb\nc\nd\n'));
  assert.ok(out.est > 0);
  assert.equal(loadProgress(root).tokens.at(-1).kind, 'extraction');
});

test('partial re-extraction replaces only items from re-extracted files', async () => {
  const root = await setup();
  await checkRefs({ _: [write(root, { zone: 'trips', files: ['api/trips.ts', 'app/Trip.tsx'], items: [
    it({ id: 'c1', k: 'surface', label: 'old api', ref: 'api/trips.ts:1' }),
    it({ id: 'c2', k: 'surface', label: 'screen', ref: 'app/Trip.tsx:1' }),
  ] })], flags: {} }, ctx(root));
  await checkRefs({ _: [write(root, { zone: 'trips', files: ['api/trips.ts'], items: [
    it({ id: 'c7', k: 'surface', label: 'new api', ref: 'api/trips.ts:3' }),
  ] })], flags: {} }, ctx(root));
  assert.deepEqual(loadModel(root).zones.trips.items.map((i) => i.id).sort(), ['c2', 'c7']);
});

test('flow and transition integrity', async () => {
  const root = await setup();
  const out = await checkRefs({ _: [write(root, { zone: 'trips', files: ['api/trips.ts'], items: [
    it({ id: 's1', k: 'state', label: 'active', ref: 'api/trips.ts:1' }),
    it({ id: 't1', k: 'transition', from: 's1', to: 's9', ref: 'api/trips.ts:2' }),
    it({ id: 'f1', k: 'flow', label: 'cancel', steps: [['s1']], ref: 'api/trips.ts:3' }),
    it({ id: 'f2', k: 'flow', label: 'bad', steps: [['s1'], ['zz']], ref: 'api/trips.ts:3' }),
  ] })], flags: {} }, ctx(root));
  assert.deepEqual(out.dropped.map((d) => `${d.id}:${d.why}`).sort(), ['f2:dangling', 't1:dangling']);
});

test('unknown zone and invalid top level error clearly', async () => {
  const root = await setup();
  await assert.rejects(checkRefs({ _: [write(root, { zone: 'x', files: [], items: [] })], flags: {} }, ctx(root)), /unknown zone "x"/);
  await assert.rejects(checkRefs({ _: [write(root, { zone: 'trips' })], flags: {} }, ctx(root)), /invalid extraction: files: required/);
});

test('refs escaping the project root are dropped as no-file', async () => {
  const root = await setup();
  const out = await checkRefs({ _: [write(root, { zone: 'trips', files: ['api/trips.ts'], items: [
    it({ id: 'x1', k: 'surface', label: 'up', ref: '../x.ts:1', outside: true }),
    it({ id: 'x2', k: 'surface', label: 'abs', ref: '/etc/passwd:1', outside: true }),
    it({ id: 'x3', k: 'surface', label: 'unc', ref: '//srv/share/x:1', outside: true }),
    it({ id: 'ok', k: 'surface', label: 'fine', ref: 'api/trips.ts:1' }),
  ] })], flags: {} }, ctx(root));
  assert.deepEqual(out.dropped.map((d) => `${d.id}:${d.why}`).sort(), ['x1:no-file', 'x2:no-file', 'x3:no-file']);
  assert.equal(out.kept, 1);
});

test('integrity covers the merged set in both directions', async () => {
  const root = await setup();
  await checkRefs({ _: [write(root, { zone: 'trips', files: ['api/trips.ts', 'app/Trip.tsx'], items: [
    it({ id: 'a', k: 'surface', label: 'api', ref: 'api/trips.ts:1' }),
    it({ id: 'b', k: 'surface', label: 'screen', ref: 'app/Trip.tsx:1' }),
    it({ id: 'e', k: 'edge', from: 'b', to: 'a', ref: 'app/Trip.tsx:2' }),
  ] })], flags: {} }, ctx(root));
  const out = await checkRefs({ _: [write(root, { zone: 'trips', files: ['api/trips.ts'], items: [
    it({ id: 'n', k: 'surface', label: 'new', ref: 'api/trips.ts:3' }),
    it({ id: 'ne', k: 'edge', from: 'n', to: 'b', ref: 'api/trips.ts:4' }),
  ] })], flags: {} }, ctx(root));
  assert.deepEqual(out.dropped.map((d) => `${d.id}:${d.why}`), ['e:dangling']);
  assert.equal(out.kept, 2);
  assert.deepEqual(loadModel(root).zones.trips.items.map((i) => i.id).sort(), ['b', 'n', 'ne']);
});

test('duplicate id is dropped even if the first was dropped for another reason', async () => {
  const root = await setup();
  const out = await checkRefs({ _: [write(root, { zone: 'trips', files: ['api/trips.ts'], items: [
    it({ id: 'c1', k: 'surface', label: 'ghost', ref: 'api/nope.ts:1' }),
    it({ id: 'c1', k: 'surface', label: 'real', ref: 'api/trips.ts:1' }),
  ] })], flags: {} }, ctx(root));
  assert.deepEqual(out.dropped.map((d) => `${d.id}:${d.why}`), ['c1:no-file', 'c1:dup-id']);
  assert.equal(out.kept, 0);
});

test('extraction file with a BOM is accepted', async () => {
  const root = await setup();
  const p = join(root, 'ex.json');
  writeFileSync(p, '\uFEFF' + JSON.stringify({ zone: 'trips', files: ['api/trips.ts'], items: [
    it({ id: 'c1', k: 'surface', label: 'api', ref: 'api/trips.ts:1' }),
  ] }));
  const out = await checkRefs({ _: [p], flags: {} }, ctx(root));
  assert.equal(out.kept, 1);
});
