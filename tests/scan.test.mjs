import test from 'node:test';
import assert from 'node:assert/strict';
import { run as scan } from '../own-it/scripts/lib/cmd-scan.mjs';
import { saveModel, zoneFiles, matchesPath } from '../own-it/scripts/lib/model.mjs';
import { tmpProject, ctx } from './helpers.mjs';

const files = {
  'package.json': JSON.stringify({ dependencies: { express: '4', 'react-router-dom': '6' } }),
  'api/trips.ts': [
    "import { Router } from 'express';",
    'const r = Router();',
    "r.post('/trips/:id/cancel', requireRole('driver'), cancel);",
    "r.post('/trips/:id/approve-cancel', requireRole('manager'), approve);",
    "export const TRIP_STATUS = ['active', 'cancel_pending', 'cancelled'];",
    "trip.status = 'cancel_pending';",
  ].join('\n'),
  'app/driver/Trip.tsx': [
    'export function TripScreen() {',
    '  return <button title="Release cable">Cancel Trip</button>;',
    '}',
    '<Route path="/trip/:id" element={<TripScreen/>} />',
  ].join('\n'),
  'manager/Portal.tsx': '<Route path="/approvals" element={<Approvals/>} />\n',
};

test('scan detects frameworks and emits candidates with 1-based refs', async () => {
  const root = tmpProject(files, { git: false });
  const out = await scan({ _: [], flags: {} }, ctx(root));
  assert.deepEqual(out.frameworks.sort(), ['express', 'react-router']);
  const labels = out.candidates.map((c) => `${c.k}|${c.label}|${c.ref}`);
  assert.ok(labels.includes('surface|POST /trips/:id/cancel|api/trips.ts:3'), labels.join('\n'));
  assert.ok(labels.includes('surface|screen /trip/:id|app/driver/Trip.tsx:4'));
  assert.ok(labels.includes('surface|screen /approvals|manager/Portal.tsx:1'));
  assert.ok(labels.includes('role|role check requireRole manager|api/trips.ts:4'));
  assert.ok(labels.includes('state|status set TRIP_STATUS|api/trips.ts:5'));
  assert.equal(out.fileCount, 4);
  assert.equal(out.dirs['api'], 1);
  assert.equal(out.truncated, false);
});

test('scan caps candidates at 300 and flags truncation', async () => {
  const many = { 'package.json': JSON.stringify({ dependencies: { express: '4' } }) };
  many['api/r.js'] = Array.from({ length: 320 }, (_, i) => `app.get('/r${i}', h);`).join('\n');
  const out = await scan({ _: [], flags: {} }, ctx(tmpProject(many, { git: false })));
  assert.equal(out.candidates.length, 300);
  assert.equal(out.truncated, true);
});

test('zoneFiles matches path prefixes on segment boundaries', () => {
  const root = tmpProject({ 'api/trips.ts': '', 'api/tripsy.ts': '', 'api/trips/x.ts': '', 'app/a.tsx': '' }, { git: false });
  assert.deepEqual(zoneFiles(root, { paths: ['api/trips'] }), ['api/trips.ts', 'api/trips/x.ts']);
});

test('scan --strings lists zone terms with refs, capped', async () => {
  const root = tmpProject(files, { git: false });
  saveModel(root, { version: 1, zones: { trips: { name: 'Trips', paths: ['api', 'app'], files: {}, items: [] } } });
  const out = await scan({ _: [], flags: { strings: 'trips' } }, ctx(root));
  const terms = Object.fromEntries(out.terms.map((t) => [t.t, t]));
  assert.ok(terms['cancel_pending'], JSON.stringify(out));
  assert.equal(terms['cancel_pending'].kind, 'status');
  assert.ok(terms['Cancel Trip']);
  assert.ok(terms['Release cable']);
  assert.ok(out.terms.length <= 60);
  assert.ok(out.terms.every((t) => t.refs.length <= 3));
});

test('scan --strings on unknown zone errors', async () => {
  const root = tmpProject(files, { git: false });
  await assert.rejects(scan({ _: [], flags: { strings: 'nope' } }, ctx(root)), /unknown zone "nope"/);
});

test('matchesPath takes the extension dot from the basename only', () => {
  assert.equal(matchesPath('Makefile', 'Makefil'), false);
  assert.equal(matchesPath('v1.2/foo', 'v1'), false);
  assert.equal(matchesPath('api/trips.ts', 'api/trips'), true);
  assert.equal(matchesPath('api/trips/x.ts', 'api/trips'), true);
});

test('scan --strings rejects inherited property names as zones', async () => {
  const root = tmpProject(files, { git: false });
  await assert.rejects(scan({ _: [], flags: { strings: 'constructor' } }, ctx(root)), /unknown zone "constructor"/);
});

test('scan matches pattern extensions case-insensitively', async () => {
  const root = tmpProject({ 'package.json': JSON.stringify({ dependencies: { 'react-router-dom': '6' } }), 'app/A.TSX': '<Route path="/up" element={<A/>} />' }, { git: false });
  const out = await scan({ _: [], flags: {} }, ctx(root));
  assert.ok(out.candidates.some((c) => c.label === 'screen /up'), JSON.stringify(out.candidates));
});
