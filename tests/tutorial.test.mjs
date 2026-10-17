import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { createEnv } from './fake-dom.mjs';

const require = createRequire(import.meta.url);
void require;
const ASSETS = new URL('../own-it/assets/', import.meta.url);
const FILES = ['z.js', 'icons.js', 'router.js', 'flap.js', 'toggle.js', 'juice.js', 'keys.js', 'link.js', 'shell.js', 'gamekit.js', 'screenhost.js'];
const GAMES = readdirSync(new URL('games/', ASSETS)).filter((f) => f.endsWith('.js')).map((f) => f.replace(/\.js$/, ''));

const REAL_RANDOM = Math.random;
after(() => { Math.random = REAL_RANDOM; });

// One environment with the engine and every game registered, and the sounds recorded.
function world() {
  const env = createEnv({ reduced: true });
  env.load(...FILES);
  const w = env.window;
  w.TextDecoder = TextDecoder;
  w.TextEncoder = TextEncoder;
  vm.runInContext(readFileSync(new URL('core.js', ASSETS), 'utf8'), env.ctx, { filename: 'core.js' });
  const sounds = [];
  w.OwnIt.audio = { play: (n) => sounds.push(n) };
  w.OwnIt.juice.confetti = () => {};
  for (const g of GAMES) vm.runInContext(readFileSync(new URL(`games/${g}.js`, ASSETS), 'utf8'), env.ctx, { filename: `${g}.js` });
  const all = (sel) => Array.from(env.document.body.querySelectorAll(sel));
  return { env, w, sounds, all, text: () => env.document.body.textContent };
}

const buttonNamed = (x, label) => x.all('button').find((b) => b.textContent === label);

test('every game has a How to play: its tutorial or a one-card summary with its keys', () => {
  assert.equal(GAMES.length, readdirSync(new URL('games/', ASSETS)).filter((f) => f.endsWith('.meta.json')).length);
  assert.ok(GAMES.includes('case-file') && GAMES.includes('next-tick'));
  const guided = [];
  for (const g of GAMES) {
    const x = world();
    const def = x.w.OwnIt.games.get(g);
    assert.ok(def, `${g} registers`);
    assert.ok(Array.isArray(def.keys) && def.keys.length, `${g} lists its keys`);
    x.w.OwnIt.howToPlay(g);
    const card = x.all('.tutorial-card')[0];
    assert.ok(card, `${g} opens a How to play card`);
    assert.match(card.textContent, /How to play/);
    if (def.tutorial) guided.push(g);
    else for (const k of def.keys) assert.ok(card.textContent.includes(k[1]), `${g} card shows "${k[1]}"`);
  }
  assert.deepEqual(guided.sort(), ['blast-radius', 'chain-reaction', 'pipe-plumber', 'what-if']);
});

test('every game builds its play area with the shell, which carries the How to play button', () => {
  for (const g of GAMES) assert.match(readFileSync(new URL(`games/${g}.js`, ASSETS), 'utf8'), /OwnIt\.shell\(/, `${g} uses the shell`);
  const x = world();
  const root = x.env.document.createElement('div');
  x.env.document.body.appendChild(root);
  x.w.OwnIt.shell(root, { game: 'quiz', roundId: 'z-quiz-1', keys: { on: () => () => {} }, router: { go() {} } }, { zone: 'z', total: 1 });
  const how = Array.from(root.querySelectorAll('button')).find((b) => b.textContent === 'How to play');
  assert.ok(how, 'the shell header has a How to play button');
  how.click();
  assert.match(x.text(), /How to play Quiz|How to play quiz/i);
});

test('blast radius tutorial: each step needs the right action, wrong clicks nudge, Got it finishes and marks it seen', () => {
  const x = world();
  const ended = [];
  const { nodes, coach } = x.w.OwnIt.howToPlay('blast-radius', { onEnd: (r) => ended.push(r) });
  assert.match(x.text(), /Nothing here comes from your app/);
  assert.match(x.text(), /Click the part marked BROKEN/);
  assert.equal(coach.index(), 0);
  nodes.profile.click();
  assert.equal(coach.index(), 0, 'a wrong click does not advance');
  assert.match(x.text(), /That part still works/);
  nodes.login.click();
  assert.equal(coach.index(), 1);
  nodes.help.click();
  assert.equal(coach.index(), 1, 'the decoy is refused');
  assert.match(x.text(), /Help page has no arrow/);
  nodes.profile.click();
  assert.equal(coach.index(), 1, 'one of two is not enough');
  assert.match(x.text(), /Selected 1 part\./);
  nodes.admin.click();
  assert.equal(coach.index(), 2);
  assert.match(x.text(), /Selected 2 parts\./);
  nodes.check.click();
  assert.equal(coach.index(), 3);
  assert.match(x.text(), /Profile page calls Login service\./);
  assert.ok(x.sounds.includes('press') && x.sounds.includes('correct') && x.sounds.includes('hint'));
  assert.equal(x.w.OwnIt.kit.tutorialSeen('blast-radius'), false);
  buttonNamed(x, 'Got it').click();
  assert.deepEqual(ended, ['done']);
  assert.equal(x.all('.tutorial-card').length, 0, 'the card closes');
  assert.equal(x.w.OwnIt.kit.tutorialSeen('blast-radius'), true);
  assert.equal(x.w.OwnIt.tutorialOpen, 0);
});

test('tutorial: Esc skips and still marks the game as seen; auto start runs once', () => {
  const x = world();
  const ended = [];
  const t = x.w.OwnIt.howToPlay('pipe-plumber', { onEnd: (r) => ended.push(r) });
  assert.equal(x.w.OwnIt.kit.tutorialSeen('pipe-plumber'), false);
  t.coach.el.dispatchEvent(x.env.event('keydown', { key: 'Escape' }));
  assert.deepEqual(ended, ['skip']);
  assert.equal(x.all('.tutorial-card').length, 0);
  assert.equal(x.w.OwnIt.kit.tutorialSeen('pipe-plumber'), true);
  x.w.OwnIt.autoHowTo('pipe-plumber');
  assert.equal(x.all('.tutorial-card').length, 0, 'seen games do not open again by themselves');
  x.w.OwnIt.autoHowTo('what-if');
  assert.equal(x.all('.tutorial-card').length, 1, 'an unseen game opens its tutorial');
  buttonNamed(x, 'Skip').click();
  assert.equal(x.w.OwnIt.kit.tutorialSeen('what-if'), true);
  x.w.OwnIt.autoHowTo('what-if');
  assert.equal(x.all('.tutorial-card').length, 0);
});

test('seen flags can also come from progress settings', () => {
  const x = world();
  x.w.OWNIT_PROGRESS = { settings: { tutorials: { quiz: true } } };
  assert.equal(x.w.OwnIt.kit.tutorialSeen('quiz'), true);
  assert.equal(x.w.OwnIt.kit.tutorialSeen('pager'), false);
});

test('pipe plumber, what-if and chain reaction tutorials walk their steps in order', () => {
  const x = world();
  let t = x.w.OwnIt.howToPlay('pipe-plumber');
  t.nodes.a.click();
  assert.equal(t.coach.index(), 0);
  t.nodes.b.click(); t.nodes.c.click();
  assert.equal(t.coach.index(), 2);
  assert.ok(t.nodes.d.classList.contains('wet'));
  buttonNamed(x, 'Got it').click();

  t = x.w.OwnIt.howToPlay('what-if');
  t.nodes.web.click();
  assert.equal(t.coach.index(), 0);
  t.nodes.db.click(); t.nodes.lock.click();
  assert.equal(t.coach.index(), 2);
  buttonNamed(x, 'Got it').click();

  t = x.w.OwnIt.howToPlay('chain-reaction');
  t.nodes.mail.click();
  assert.equal(t.coach.index(), 0, 'out of order is refused');
  t.nodes.pay.click(); t.nodes.charge.click(); t.nodes.mail.click();
  assert.equal(t.coach.index(), 3);
  buttonNamed(x, 'Got it').click();
  assert.equal(x.all('.tutorial-card').length, 0);
});

test('the shell timer and fuses wait while a tutorial is open', () => {
  const x = world();
  x.w.OwnIt.howToPlay('quiz');
  assert.ok(x.w.OwnIt.tutorialOpen > 0);
  buttonNamed(x, 'Got it').click();
  assert.equal(x.w.OwnIt.tutorialOpen, 0);
});

test('where this lives: shown only after the round finishes, as text without a project root and as editor links with one', () => {
  const x = world();
  const list = [{ label: 'Trip service', ref: 'server/trip.ts:12' }, { label: 'Database', ref: 'server/db.ts:3' }];
  x.w.OWNIT_ROUNDS = { 'z-quiz-1': { where: x.w.OwnItCore.encode(list) } };
  const root = x.env.document.createElement('div');
  x.env.document.body.appendChild(root);
  const ctx = { game: 'quiz', roundId: 'z-quiz-1', keys: { on: () => () => {} }, router: { go() {} }, finish() {} };
  const shell = x.w.OwnIt.shell(root, ctx, { zone: 'z', total: 1 });
  assert.ok(!/server\/trip\.ts/.test(x.text()), 'hidden while playing');
  let decodes = 0;
  const real = x.w.OwnItCore.decode;
  x.w.OwnItCore.decode = (s) => { decodes++; return real(s); };
  x.w.OwnIt.kit.finish(shell, ctx, { game: 'quiz', mode: 'practice', got: 1, of: 1, xp: 10, missed: [], review: [] });
  assert.equal(decodes, 1);
  const card = x.all('.result-card')[0];
  assert.match(card.textContent, /Where this lives in your code/);
  assert.match(card.textContent, /Trip service.*server\/trip\.ts:12/);
  assert.equal(card.querySelectorAll('a').length, 0, 'no OWNIT_ROOT: plain text');
  x.w.OWNIT_ROOT = 'C:/work/app';
  x.w.OwnIt.kit.finish(shell, ctx, { game: 'quiz', mode: 'practice', got: 1, of: 1, xp: 10, missed: [], review: [] });
  const links = Array.from(x.all('.result-card')[1].querySelectorAll('a')).filter((a) => /^vscode:\/\/file\/C:\/work\/app\/server\/db\.ts:3$/.test(a.getAttribute('href')));
  assert.equal(links.length, 1, 'with OWNIT_ROOT the ref opens the editor');
});
