import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { sanitize } from '../own-it/scripts/lib/sanitize.mjs';
import { run as init } from '../own-it/scripts/lib/cmd-init.mjs';
import { run as build } from '../own-it/scripts/lib/cmd-build-screen.mjs';
import { run as fog } from '../own-it/scripts/lib/cmd-fog.mjs';
import { loadModel, saveModel } from '../own-it/scripts/lib/model.mjs';
import { tmpProject, writeFiles, commit, ctx } from './helpers.mjs';

const clean = (h) => sanitize(h).html;

test('strips script and onclick', () => {
  const r = sanitize('<div onclick="x()" class="a">hi<script>alert(1)</script></div>');
  assert.equal(r.html, '<div class="a">hi</div>');
  assert.ok(r.dropped.includes('onclick') && r.dropped.includes('script'));
});

test('drops javascript: href, including entity and case tricks', () => {
  assert.equal(clean('<a href="javascript:alert(1)">x</a>'), '<a href="#">x</a>');
  assert.equal(clean('<A HREF="&#106;avascript:alert(1)">x</A>'), '<a href="#">x</a>');
  assert.equal(clean('<a href=https://evil.example>x</a>'), '<a href="#">x</a>');
});

test('drops url() style, escaped url, import and expression', () => {
  assert.equal(clean('<div style="background:url(http://x/a.png)">a</div>'), '<div>a</div>');
  assert.equal(clean('<div style="background:u\\72l(http://x)">a</div>'), '<div>a</div>');
  assert.equal(clean('<div style="background:u&#114;l(http://x)">a</div>'), '<div>a</div>');
  assert.equal(clean('<div style="width:expression(alert(1))">a</div>'), '<div>a</div>');
  assert.equal(clean('<div style="color:red">a</div>'), '<div style="color:red">a</div>');
  assert.equal(clean('<style>.a{color:red}</style><p>x</p>'), '<style>.a{color:red}</style><p>x</p>');
  assert.equal(clean('<style>@import "x.css";</style><p>x</p>'), '<p>x</p>');
  assert.equal(clean('<style>.a{background:u\\72l(x)}</style><p>x</p>'), '<p>x</p>');
  assert.equal(clean('<p>a</p><style>.a{color:red}</style>'), '<p>a</p>');
});

test('keeps data-ownit and form fields', () => {
  const h = '<form action="/pay"><label for="n">Name</label><input type="text" name="n" placeholder="Jo" value="v" disabled data-ownit="el1" data-x="1"><select><option selected>a</option></select><textarea>t</textarea></form>';
  assert.equal(clean(h), '<form><label for="n">Name</label><input type="text" name="n" placeholder="Jo" value="v" disabled="" data-ownit="el1"><select><option selected="">a</option></select><textarea>t</textarea></form>');
});

test('malformed html: unclosed, unquoted, comments, nested script text, unterminated', () => {
  assert.equal(clean('<div><p>a<!-- <script>x</script> -->b'), '<div><p>ab</p></div>');
  assert.equal(clean('<div title="<script>alert(1)</script>" class=a>x</div>'), '<div class="a">x</div>');
  assert.equal(clean('<p>1 < 2 and <b>x</b></p>'), '<p>1 &lt; 2 and x</p>');
  assert.equal(clean('<img src=x onerror=alert(1)>'), '<img>');
  assert.equal(clean('<div>ok</div><img alt="x'), '<div>ok</div>');
  assert.equal(clean('<SCRIPT>alert(1)</SCRIPT>after'), 'after');
  assert.equal(clean('<script>no close <p>x'), '');
  assert.equal(clean('<textarea><img onerror=x></textarea>'), '<textarea>&lt;img onerror=x&gt;</textarea>');
  assert.equal(clean('<iframe src="x"><p>in</p></iframe><p>out</p>'), '<p>out</p>');
});

test('img src only small data images', () => {
  assert.equal(clean('<img src="data:image/png;base64,AAAA" alt="a">'), '<img src="data:image/png;base64,AAAA" alt="a">');
  assert.equal(clean('<img src="http://x/a.png">'), '<img>');
  assert.equal(clean('<img src="data:text/html;base64,AAAA">'), '<img>');
  assert.equal(clean(`<img src="data:image/png;base64,${'A'.repeat(41 * 1024)}">`), '<img>');
});

async function setup(files = { 'api/t.ts': 'a\n' }) {
  const root = tmpProject(files);
  writeFileSync(join(root, 'zones.json'), JSON.stringify({ zones: [{ id: 'trips', name: 'Trips', paths: ['api'] }] }));
  await init({ _: [], flags: { zones: join(root, 'zones.json') } }, ctx(root));
  const m = loadModel(root);
  m.zones.trips.items = [
    { id: 's1', k: 'surface', label: 'Trip', ref: 'api/t.ts:1', conf: 'high' },
    { id: 'el1', k: 'element', on: 's1', does: 'f1', ref: 'api/t.ts:1', conf: 'high' },
    { id: 'f1', k: 'flow', label: 'cancel', ref: 'api/t.ts:1', conf: 'high' },
  ];
  saveModel(root, m);
  return root;
}
const bs = (root, html, id = 'trip', flags = {}) => {
  writeFileSync(join(root, 'in.html'), html);
  return build({ _: [id, 'in.html'], flags: { zone: 'trips', inputs: 'api/t.ts', ...flags } }, ctx(root));
};
const registry = (root) => {
  const sb = { window: {} };
  vm.runInNewContext(readFileSync(join(root, '.own-it', 'screens.js'), 'utf8'), sb);
  return JSON.parse(JSON.stringify(sb.window.OWNIT_SCREENS));
};

test('build-screen writes html and registry, prints id bytes dropped', async () => {
  const root = await setup();
  const out = await bs(root, '<div data-ownit="el1" onclick="x">Cancel trip</div><div data-ownit="s1">Trip</div>');
  assert.equal(out.id, 'trip');
  assert.equal(out.bytes, Buffer.byteLength(readFileSync(join(root, '.own-it', 'screens', 'trip.html'), 'utf8')));
  assert.deepEqual(out.dropped, ['onclick']);
  const reg = registry(root);
  assert.equal(reg.trip.zone, 'trips');
  assert.match(reg.trip.html, /data-ownit="el1"/);
  assert.deepEqual(Object.keys(reg.trip.inputs), ['api/t.ts']);
  assert.match(reg.trip.inputs['api/t.ts'], /^[0-9a-f]{40}$/);
});

test('rejects email in text', async () => {
  const root = await setup();
  await assert.rejects(bs(root, '<p>Mail jane.doe@acme-corp.com</p>'), /real data.*email/);
  await assert.rejects(bs(root, '<p>id 123e4567-e89b-12d3-a456-426614174000</p>'), /uuid/);
  await assert.rejects(bs(root, `<p>${'a1b2c3d4'.repeat(4)}</p>`), /hex run/);
  await assert.rejects(bs(root, '<p>QWxhZGRpbjpvcGVuIHNlc2FtZTEyMzQ1Ng</p>'), /base64/);
  assert.equal(existsSync(join(root, '.own-it', 'screens.js')), false);
});

test('rejects env value without echoing it', async () => {
  const root = await setup();
  writeFiles(root, { '.env.local': 'API_KEY="s3cr3t-token-value"\nDEBUG=1\n' });
  await assert.rejects(bs(root, '<p>use s3cr3t-token-value now</p>'), (e) => /API_KEY/.test(e.message) && !/s3cr3t/.test(e.message));
  await assert.rejects(bs(root, '<p>use s3cr3t&#45;token-value now</p>'), /API_KEY/);
  await bs(root, '<p>debug 1</p>');
});

test('rejects unknown data-ownit and non element/surface ids', async () => {
  const root = await setup();
  await assert.rejects(bs(root, '<div data-ownit="nope">x</div>'), /nope/);
  await assert.rejects(bs(root, '<div data-ownit="f1">x</div>'), /f1/);
});

test('61KB rejected, cap of 8 screens per zone, bad args', async () => {
  const root = await setup();
  await assert.rejects(bs(root, `<p>${'word '.repeat(13000)}</p>`), /too large/);
  for (let i = 0; i < 8; i++) await bs(root, '<p>x</p>', `s${i}`);
  await assert.rejects(bs(root, '<p>x</p>', 'extra'), /already has 8/);
  await bs(root, '<p>y</p>', 's3');
  await assert.rejects(bs(root, '<p>x</p>', '../evil'), /invalid screen id/);
  await assert.rejects(bs(root, '<p>x</p>', 's3', { zone: 'nozone' }), /unknown zone/);
  await assert.rejects(bs(root, '<p>x</p>', 's3', { inputs: 'api/missing.ts' }), /inputs not found/);
  await assert.rejects(bs(root, '<p>x</p>', 's3', { inputs: '../x' }), /project-relative/);
});

test('fog lists stale screen after input commit', async () => {
  const root = await setup();
  await bs(root, '<p>x</p>');
  assert.deepEqual((await fog({ _: [], flags: {} }, ctx(root))).zones[0].staleScreens, []);
  writeFiles(root, { 'api/t.ts': 'changed\n' });
  assert.deepEqual((await fog({ _: [], flags: {} }, ctx(root))).zones[0].staleScreens, []);
  commit(root, 'change');
  assert.deepEqual((await fog({ _: [], flags: {} }, ctx(root))).zones[0].staleScreens, ['trip']);
  await bs(root, '<p>x</p>');
  assert.deepEqual((await fog({ _: [], flags: {} }, ctx(root))).zones[0].staleScreens, []);
});
