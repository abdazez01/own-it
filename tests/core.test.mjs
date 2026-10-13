import test from 'node:test';
import assert from 'node:assert/strict';
import core from '../own-it/scripts/lib/core.mjs';

test('encode/decode round trip with unicode; output is not plain JSON', () => {
  const obj = { steps: [['c1'], ['c2', 'c3']], note: 'café → ok' };
  const enc = core.encode(obj);
  assert.doesNotMatch(enc, /steps|c1/);
  assert.deepEqual(core.decode(enc), obj);
});

test('base64 matches Node Buffer for all lengths 0..20', () => {
  for (let n = 0; n <= 20; n++) {
    const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11) % 256);
    assert.equal(core.toBase64(bytes), Buffer.from(bytes).toString('base64'));
    assert.deepEqual(Array.from(core.fromBase64(core.toBase64(bytes))), Array.from(bytes));
  }
});

test('gradeComponent: correct, missed, wrong, duplicates ignored', () => {
  const answer = { edges: [{ id: 'e1', from: 'a', to: 'b' }, { id: 'e2', from: 'b', to: 'c' }] };
  const r = core.gradeComponent(answer, [['a', 'b'], ['a', 'b'], ['c', 'b']]);
  assert.deepEqual(r, { got: 1, of: 2, missed: ['e2'], wrong: [['c', 'b']] });
});

test('gradeSwimlanes: unordered group, wrong lane half credit, out of order missed', () => {
  const answer = { steps: [['c0'], ['c1'], ['c4', 'c5'], ['c3']],
    lanes: { c0: 'Driver', c1: 'Backend', c4: 'Backend', c5: 'Backend', c3: 'Manager' } };
  const perfect = core.gradeSwimlanes(answer, [
    { id: 'c0', lane: 'Driver' }, { id: 'c1', lane: 'Backend' }, { id: 'c5', lane: 'Backend' },
    { id: 'c4', lane: 'Backend' }, { id: 'c3', lane: 'Manager' }]);
  assert.deepEqual(perfect, { got: 5, of: 5, missed: [], wrong: [] });
  const r = core.gradeSwimlanes(answer, [
    { id: 'c3', lane: 'Manager' }, { id: 'c0', lane: 'Backend' }, { id: 'c1', lane: 'Backend' }, { id: 'c4', lane: 'Backend' }]);
  assert.equal(r.of, 5);
  assert.equal(r.got, 2.5);
  assert.deepEqual(r.missed.sort(), ['c3', 'c5']);
});

test('gradeBreak', () => {
  const r = core.gradeBreak({ threats: [{ id: 'f1', card: 'c1' }, { id: 'f2', card: 'c3' }] }, { f1: 'c1', f2: 'c2' });
  assert.deepEqual(r, { got: 1, of: 2, missed: ['f2'], wrong: [['f2', 'c2']] });
});

test('matchLabels: fuzzy one-to-one with threshold', () => {
  const cards = [{ id: 'c1', label: 'POST /trips/:id/cancel' }, { id: 'c2', label: 'Manager approvals screen' }, { id: 'c3', label: 'Trips table' }];
  const m = core.matchLabels([
    { uid: 'u1', label: 'cancel trips post' }, { uid: 'u2', label: 'approvals screen (manager)' },
    { uid: 'u3', label: 'payments' }], cards);
  assert.deepEqual(m, { u1: 'c1', u2: 'c2' });
});

test('gradeBoss combines card matches and edges', () => {
  const answer = { cards: [{ id: 'c1', label: 'Driver app' }, { id: 'c2', label: 'Trips API' }],
    edges: [{ id: 'e1', from: 'c1', to: 'c2' }] };
  const r = core.gradeBoss(answer, [{ uid: 'x', label: 'driver app' }, { uid: 'y', label: 'trips api' }], [['x', 'y']]);
  assert.deepEqual(r, { got: 3, of: 3, missed: [], wrong: [] });
});

test('payload omits empty wrong and stamps time', () => {
  const p = core.payload('m1', { got: 1, of: 2, missed: ['e2'], wrong: [] }, { c3: 'why' }, 0, [], new Date('2026-10-13T16:10:00Z'));
  assert.deepEqual(p, { id: 'm1', submittedAt: '2026-10-13T16:10:00.000Z', got: 1, of: 2, missed: ['e2'], text: { c3: 'why' }, hintsUsed: 0, challenges: [] });
});

// ---- edge cases beyond the brief ----

test('KEY is the v1 anti-spoiler key and encode is deterministic XOR (decodable by hand)', () => {
  assert.equal(core.KEY, 'own-it:anti-spoiler:v1');
  const enc = core.encode({ a: 1 });
  const raw = Buffer.from(enc, 'base64');
  const key = Buffer.from(core.KEY, 'utf8');
  const plain = Buffer.from(raw.map((b, i) => b ^ key[i % key.length])).toString('utf8');
  assert.equal(plain, '{"a":1}');
});

test('encode/decode handles payloads longer than the key and astral characters', () => {
  const obj = { long: 'x'.repeat(100), emoji: '🚕 trip', nested: { n: [1, 2, 3], t: true, z: null } };
  assert.deepEqual(core.decode(core.encode(obj)), obj);
});

test('fromBase64 tolerates missing padding and whitespace; matches Buffer decoding', () => {
  for (let n = 0; n <= 20; n++) {
    const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 91 + 200) % 256);
    const b64 = Buffer.from(bytes).toString('base64');
    const unpadded = b64.replace(/=+$/, '');
    assert.deepEqual(Array.from(core.fromBase64(unpadded)), Array.from(bytes), `unpadded n=${n}`);
    const spaced = b64.replace(/(.{4})/g, '$1\n ');
    assert.deepEqual(Array.from(core.fromBase64(spaced)), Array.from(bytes), `spaced n=${n}`);
  }
  assert.ok(core.fromBase64('') instanceof Uint8Array);
  assert.equal(core.fromBase64('').length, 0);
  assert.equal(core.toBase64(new Uint8Array(0)), '');
});

test('base64 covers every byte value', () => {
  const bytes = Uint8Array.from({ length: 256 }, (_, i) => i);
  const b64 = core.toBase64(bytes);
  assert.equal(b64, Buffer.from(bytes).toString('base64'));
  assert.deepEqual(Array.from(core.fromBase64(b64)), Array.from(bytes));
});

test('gradeComponent: empty user edges, empty answer, direction matters, wrong deduped', () => {
  const answer = { edges: [{ id: 'e1', from: 'a', to: 'b' }] };
  assert.deepEqual(core.gradeComponent(answer, []), { got: 0, of: 1, missed: ['e1'], wrong: [] });
  assert.deepEqual(core.gradeComponent({ edges: [] }, []), { got: 0, of: 0, missed: [], wrong: [] });
  assert.deepEqual(core.gradeComponent(answer, [['b', 'a'], ['b', 'a']]),
    { got: 0, of: 1, missed: ['e1'], wrong: [['b', 'a']] });
});

test('gradeComponent: ids containing separator-like characters do not collide', () => {
  const answer = { edges: [{ id: 'e1', from: 'a>b', to: 'c' }] };
  const r = core.gradeComponent(answer, [['a', 'b>c']]);
  assert.deepEqual(r, { got: 0, of: 1, missed: ['e1'], wrong: [['a', 'b>c']] });
});

test('gradeSwimlanes: nothing placed -> all missed', () => {
  const answer = { steps: [['c0'], ['c1', 'c2']], lanes: { c0: 'A', c1: 'B', c2: 'B' } };
  assert.deepEqual(core.gradeSwimlanes(answer, []), { got: 0, of: 3, missed: ['c0', 'c1', 'c2'], wrong: [] });
});

test('gradeSwimlanes: unknown cards skipped; card placed twice counts once', () => {
  const answer = { steps: [['c0'], ['c1']], lanes: { c0: 'A', c1: 'B' } };
  const r = core.gradeSwimlanes(answer, [
    { id: 'zz', lane: 'A' }, { id: 'c0', lane: 'A' }, { id: 'c0', lane: 'A' }, { id: 'c1', lane: 'B' }]);
  assert.deepEqual(r, { got: 2, of: 2, missed: [], wrong: [] });
});

test('gradeSwimlanes: LNDS tie prefers the earliest subsequence', () => {
  // groups placed: [1, 0] -> both length-1 subsequences; earliest (c1) is kept.
  const answer = { steps: [['c0'], ['c1']], lanes: { c0: 'A', c1: 'B' } };
  const r = core.gradeSwimlanes(answer, [{ id: 'c1', lane: 'B' }, { id: 'c0', lane: 'A' }]);
  assert.deepEqual(r, { got: 1, of: 2, missed: ['c0'], wrong: [] });
  // groups [2, 0, 1]: LNDS is [0, 1] (length 2) beating the earlier single [2].
  const answer3 = { steps: [['a'], ['b'], ['c']], lanes: { a: 'X', b: 'X', c: 'X' } };
  const r3 = core.gradeSwimlanes(answer3, [{ id: 'c', lane: 'X' }, { id: 'a', lane: 'X' }, { id: 'b', lane: 'X' }]);
  assert.deepEqual(r3, { got: 2, of: 3, missed: ['c'], wrong: [] });
});

test('gradeSwimlanes: equal groups are non-decreasing (same-step cards in any order)', () => {
  const answer = { steps: [['a', 'b', 'c']], lanes: { a: 'L', b: 'L', c: 'M' } };
  const r = core.gradeSwimlanes(answer, [{ id: 'c', lane: 'L' }, { id: 'b', lane: 'L' }, { id: 'a', lane: 'L' }]);
  assert.deepEqual(r, { got: 2.5, of: 3, missed: [], wrong: [['c', 'L']] });
});

test('gradeSwimlanes: wrong lists in-order cards in the wrong lane as [id, placedLane]', () => {
  const answer = { steps: [['c0'], ['c1'], ['c2']], lanes: { c0: 'Driver', c1: 'Backend', c2: 'Manager' } };
  const r = core.gradeSwimlanes(answer, [{ id: 'c0', lane: 'Backend' }, { id: 'c2', lane: 'Manager' }, { id: 'c1', lane: 'Driver' }]);
  // c1 is out of order (missed, not wrong); c0 is kept in the wrong lane.
  assert.deepEqual(r, { got: 1.5, of: 3, missed: ['c1'], wrong: [['c0', 'Backend']] });
});

test('gradeBreak: unplaced threat is missed but not wrong; extra placements ignored', () => {
  const answer = { threats: [{ id: 'f1', card: 'c1' }, { id: 'f2', card: 'c2' }] };
  assert.deepEqual(core.gradeBreak(answer, { f1: 'c1', zz: 'c9' }), { got: 1, of: 2, missed: ['f2'], wrong: [] });
  assert.deepEqual(core.gradeBreak(answer, {}), { got: 0, of: 2, missed: ['f1', 'f2'], wrong: [] });
  assert.deepEqual(core.gradeBreak({ threats: [] }, {}), { got: 0, of: 0, missed: [], wrong: [] });
});

test('matchLabels: stopword-only/empty labels never match; one card claimed once', () => {
  const cards = [{ id: 'c1', label: 'Trips API' }, { id: 'c2', label: 'the' }];
  const m = core.matchLabels([
    { uid: 'u1', label: 'trips api' }, { uid: 'u2', label: 'Trips-API!' }, { uid: 'u3', label: 'of the' }, { uid: 'u4', label: '' }], cards);
  assert.deepEqual(m, { u1: 'c1' });
  assert.deepEqual(core.matchLabels([], cards), {});
  assert.deepEqual(core.matchLabels([{ uid: 'u1', label: 'x' }], []), {});
});

test('matchLabels: greedy picks globally highest score first, threshold inclusive at 0.5', () => {
  const cards = [{ id: 'c1', label: 'trips ledger' }, { id: 'c2', label: 'trips table' }];
  // u1 scores 0.5 with c1 and 0.2 with c2; u2 scores 1 with c1 -> u2 takes c1 even though u1 comes
  // first in input order, and u1's only remaining option (c2, 0.2) is below threshold.
  const m = core.matchLabels([{ uid: 'u1', label: 'trips ledger service gateway' }, { uid: 'u2', label: 'Trips Ledger' }], cards);
  assert.deepEqual(m, { u2: 'c1' });
  // exactly 0.5 is accepted
  assert.deepEqual(core.matchLabels([{ uid: 'u', label: 'trips' }], [{ id: 'c', label: 'trips table' }]), { u: 'c' });
});

test('matchLabels: route syntax, camelCase and plurals; other words for the same item match', () => {
  const cards = [{ id: 'r', label: 'POST /locks/:id/release-cable' }, { id: 's', label: 'tripCancelScreen' }];
  assert.deepEqual(core.matchLabels([{ uid: 'u1', label: 'release cable endpoint' }, { uid: 'u2', label: 'trip cancel screen' }], cards), { u1: 'r', u2: 's' });
  assert.deepEqual(core.matchLabels([{ uid: 'u', label: 'releaseCable API' }], cards), { u: 'r' });
});

test('matchLabels: sharing one word with a longer label is not a match; the better card wins', () => {
  const approve = { id: 'a', label: 'Approve cancel' };
  const cancel = { id: 'c', label: 'POST /trips/:id/cancel' };
  assert.deepEqual(core.matchLabels([{ uid: 'u', label: 'cancel trip' }], [approve]), {});
  assert.deepEqual(core.matchLabels([{ uid: 'u', label: 'cancel trip' }], [approve, cancel]), { u: 'c' });
  assert.deepEqual(core.matchLabels([{ uid: 'u', label: 'GET /api/route' }], [{ id: 'x', label: 'delete endpoint' }]), {});
});

test('gradeBoss: unmatched boxes, missed edges, wrong edges reported as user uid pairs', () => {
  const answer = { cards: [{ id: 'c1', label: 'Driver app' }, { id: 'c2', label: 'Trips API' }, { id: 'c3', label: 'Postgres' }],
    edges: [{ id: 'e1', from: 'c1', to: 'c2' }, { id: 'e2', from: 'c2', to: 'c3' }] };
  const r = core.gradeBoss(answer,
    [{ uid: 'x', label: 'driver app' }, { uid: 'y', label: 'trips api' }, { uid: 'q', label: 'redis cache' }],
    [['y', 'x'], ['x', 'y'], ['y', 'q'], ['x', 'y']]);
  assert.deepEqual(r, { got: 3, of: 5, missed: ['c3', 'e2'], wrong: [['y', 'x'], ['y', 'q']] });
});

test('gradeBoss with pool: boxes matching unscored zone cards and their arrows are neutral', () => {
  const answer = { cards: [{ id: 'c1', label: 'Driver app' }, { id: 'c2', label: 'Trips API' }],
    edges: [{ id: 'e1', from: 'c1', to: 'c2' }],
    pool: [{ id: 'c1', label: 'Driver app' }, { id: 'c2', label: 'Trips API' }, { id: 'c9', label: 'Payments ledger' }] };
  const boxes = [{ uid: 'x', label: 'driver app' }, { uid: 'y', label: 'trips' }, { uid: 'p', label: 'payments ledger' }, { uid: 'z', label: 'redis' }];
  const r = core.gradeBoss(answer, boxes, [['x', 'y'], ['y', 'p'], ['p', 'x'], ['x', 'z']]);
  assert.deepEqual(r, { got: 3, of: 3, missed: [], wrong: [['x', 'z']] });
  // without a pool the payments box is a plain unmatched box and its arrows are wrong
  const r2 = core.gradeBoss({ cards: answer.cards, edges: answer.edges }, boxes, [['x', 'y'], ['y', 'p']]);
  assert.deepEqual(r2.wrong, [['y', 'p']]);
});

test('payload includes non-empty wrong', () => {
  const p = core.payload('m2', { got: 0, of: 1, missed: ['e1'], wrong: [['b', 'a']] }, {}, 2, ['ch1'], new Date('2026-01-01T00:00:00Z'));
  assert.deepEqual(p, { id: 'm2', submittedAt: '2026-01-01T00:00:00.000Z', got: 0, of: 1, missed: ['e1'], wrong: [['b', 'a']], text: {}, hintsUsed: 2, challenges: ['ch1'] });
});

test('core.js runs as a classic browser script and exposes self.OwnItCore', async () => {
  const { readFileSync } = await import('node:fs');
  const vm = await import('node:vm');
  const src = readFileSync(new URL('../own-it/assets/core.js', import.meta.url), 'utf8');
  const ctx = { TextEncoder, TextDecoder, Uint8Array };
  ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  assert.equal(typeof ctx.OwnItCore, 'object');
  const enc = core.encode({ x: 'é' });
  assert.equal(ctx.OwnItCore.encode({ x: 'é' }), enc);
  assert.deepEqual({ ...ctx.OwnItCore.decode(enc) }, { x: 'é' });
});

test('matchLabels: non-Latin (Arabic) labels tokenize and match', () => {
  const m = core.matchLabels([{ uid: 'u1', label: 'إلغاء الرحلة' }], [{ id: 'c1', label: 'إلغاء الرحلة API' }]);
  assert.deepEqual(m, { u1: 'c1' });
});
