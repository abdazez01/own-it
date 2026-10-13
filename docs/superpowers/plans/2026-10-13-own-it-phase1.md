# own-it Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Phase 1 of the `own-it` skill: the full game loop (scan, extraction verification, recipe expansion, game page with component map and swimlanes, answer collection, scoring, fog, token log) plus skill docs, proven end to end on a fixture repo.

**Architecture:** A publishable skill folder `own-it/` holds `SKILL.md`, phase-scoped reference docs, a zero-dependency Node CLI (`scripts/own-it.mjs` dispatching to focused modules in `scripts/lib/`), and browser assets (`game.html` plus a shared `core.js` that both the page and Node tests use for grading and answer obfuscation). The CLI does every mechanical chore and prints compact JSON; Claude does the judgment work. Tests and the fixture app live outside the skill folder so they are not shipped.

**Tech Stack:** Node.js 18+ (ESM, `node:test`, `node:assert/strict`, no npm dependencies), git CLI, vanilla HTML/CSS/JS (classic scripts, works on `file://`), SVG for the whiteboard.

**Spec:** `docs/superpowers/specs/2026-10-13-own-it-design.md`

## Global Constraints

- Node minimum `18.0.0`. Use only APIs available in Node 18 (no `fs.globSync`, no `--experimental` flags).
- Zero npm dependencies in `own-it/`. Root `package.json` is private, used only for `npm test`.
- The skill never writes outside `.own-it/` in the user's project, except moving answer files out of the Downloads folder. `init` writes `.own-it/.gitignore` (content `*`) instead of touching the repo's `.gitignore`.
- Every CLI command prints one line: compact JSON (`JSON.stringify` with no spacing) or a short string. Errors print `own-it: <message>` to stderr and exit with code 1.
- All stored paths are POSIX-style and relative to the project root.
- The project root is `process.env.OWNIT_ROOT` if set, else `process.cwd()`.
- Browser assets are classic scripts (no ES modules), because module scripts are blocked on `file://`.
- Obfuscation is anti-spoiler only. Never describe it as security.
- `SKILL.md` body ≤ 150 words. Each `references/*.md` ≤ 400 words. `references/examples.md` ≈ 80 lines.
- Extraction caps: ≤ 80 lines per read, never read a whole file > 150 lines, ≤ 30 reads per zone, ≤ 80 items per zone, one JSON line per item.
- Output caps: Practice debrief ≤ 120 words (misses only), curiosity answer ≤ 80 words, hint one sentence, boss questions one line each, Exam report card one line per zone.
- Token targets: ≤ 15,000 tokens per 5-mission session excluding extraction; ≤ 30,000 tokens per zone structure extraction.
- XP table, badges, and clear rules are exactly as spec section 8.1 and 4.1.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Windows paths and line endings.** Refs like `api\trips.ts:88` or CRLF files must still resolve: normalize to POSIX on input, count lines with `\r?\n`. Pinned in Task 2 and Task 5 tests.
2. **Answer file renamed by the browser** (`own-it-x (1).json`, `own-it-x(2).json`) or several submissions of the same mission: take the newest by mtime. Pinned in Task 9.
3. **Stale or out-of-session answer file** in Downloads from an earlier session: reject with a clear message instead of scoring it. Pinned in Task 9.
4. **Recipe referencing unknown or stale item IDs, or a locked rung**: `build-missions` must refuse with the exact IDs and what is left to clear, never write a half-valid `mission.js`. Pinned in Task 8.
5. **Project without git, or git repo with no commits yet**: scan, init, check-refs, and fog must all work; fog reports `git:false` and never throws. Pinned in Task 2 and Task 6.

---

## File Structure

```
package.json                         private; "test": "node --test"
own-it/                              the shipped skill
  SKILL.md
  runtime.json
  references/
    onboarding.md  extraction.md  rungs.md  grading.md  bosses.md  examples.md
  assets/
    game.html                        Map + Whiteboard UI (fixed template)
    core.js                          OwnItCore: codec + graders, shared by page and Node
    patterns.json                    per-framework scan patterns + string patterns
  scripts/
    own-it.mjs                       CLI entry: parse args, dispatch, print, exit codes
    lib/
      args.mjs       parseArgs
      paths.mjs      root, .own-it paths, downloads dir, posix
      json.mjs       readJson, writeJson (atomic), writeJsVar
      validate.mjs   check() + schemas
      walk.mjs       listFiles, isBinaryPath
      hash.mjs       blobHash, hashesFor
      progress.mjs   defaultProgress, loadProgress, saveProgress, RUNGS
      model.mjs      loadModel, saveModel, zoneFiles
      tokens.mjs     estimate
      core.mjs       re-exports assets/core.js for Node
      cmd-init.mjs  cmd-scan.mjs  cmd-check-refs.mjs  cmd-fog.mjs
      cmd-build-missions.mjs  cmd-collect.mjs  cmd-apply.mjs  cmd-open.mjs
tests/
  helpers.mjs
  *.test.mjs
  fixtures/missions/                 hand-written mission.js/progress.js for browser checks
fixtures/trip-app/                   sample project for the end-to-end run
```

Command module contract (used by every `cmd-*.mjs`):

```js
// args: { _: string[], flags: Record<string, string|true> }
// ctx:  { root: string, now: () => Date, env?: Record<string,string> }
export async function run(args, ctx) { /* returns object or string */ }
```

## Model Selection for Execution

| Task | Implementer model | Why |
|---|---|---|
| 1, 2, 3, 4, 5, 6, 8, 9, 11, 12, 14 | Sonnet | Mechanical, fully specified by tests |
| 7, 10, 13, 15, 16 | Opus | Algorithms, intricate rules, UI design, judgment-heavy prose, end-to-end validation |

Reviewers use Sonnet, except Tasks 10, 13, and 15, which use Opus.

---

### Task 1: Scaffold, CLI entry, core utilities

**Files:**
- Create: `package.json`, `.gitignore`
- Create: `own-it/scripts/own-it.mjs`, `own-it/scripts/lib/args.mjs`, `own-it/scripts/lib/paths.mjs`, `own-it/scripts/lib/json.mjs`, `own-it/scripts/lib/validate.mjs`, `own-it/scripts/lib/tokens.mjs`
- Create: `tests/helpers.mjs`, `tests/core-utils.test.mjs`

**Interfaces:**
- Produces:
  - `parseArgs(argv: string[]) → { _: string[], flags: Record<string,string|true> }` (`--a b` → `{a:'b'}`, `--a` followed by another flag or end → `{a:true}`, `--a=b` supported)
  - `SKILL_DIR: string` (absolute path of `own-it/`), `projectRoot(env?) → string`, `ownItPath(root, ...parts) → string`, `downloadsDir(settingDir?, env?) → string`, `toPosix(p) → string`
  - `readJson(path, fallback?)` (returns `fallback` if file missing and fallback given; throws `Error('invalid JSON in <path>')` otherwise), `writeJson(path, data)` (mkdir -p, write `<path>.tmp`, rename), `writeJsVar(path, name, data)` writes `window.<name> = <json>;\n`
  - `check(value, schema, at='') → string[]` and schemas `ITEM, EXTRACTION, RECIPE, ANSWER, ZONES`
  - `estimate(...parts: (string|object)[]) → number` = `Math.ceil(totalChars / 4)`; objects are `JSON.stringify`-ed
  - CLI: `node own-it/scripts/own-it.mjs <command> ...` → dispatches to `./lib/cmd-<command>.mjs` `run(args, ctx)`

- [ ] **Step 1: Create `package.json` and `.gitignore`**

```json
{
  "name": "own-it-dev",
  "private": true,
  "type": "module",
  "scripts": { "test": "node --test" },
  "engines": { "node": ">=18" }
}
```

`.gitignore`:
```
node_modules/
.own-it/
*.tmp
```

- [ ] **Step 2: Write `tests/helpers.mjs`**

```js
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';

export function writeFiles(root, files) {
  for (const [p, c] of Object.entries(files)) {
    const f = join(root, p);
    mkdirSync(dirname(f), { recursive: true });
    writeFileSync(f, c);
  }
}

export function commit(root, msg = 'c') {
  execFileSync('git', ['add', '-A'], { cwd: root });
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false',
    'commit', '-q', '--allow-empty', '-m', msg], { cwd: root });
}

export function tmpProject(files = {}, { git = true, commitFiles = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'ownit-'));
  writeFiles(root, files);
  if (git) {
    execFileSync('git', ['init', '-q'], { cwd: root });
    execFileSync('git', ['config', 'core.autocrlf', 'false'], { cwd: root });
    if (commitFiles) commit(root, 'init');
  }
  return root;
}

export function ctx(root, extra = {}) {
  return { root, now: () => new Date('2026-10-13T16:00:00Z'), env: {}, ...extra };
}
```

- [ ] **Step 3: Write the failing tests `tests/core-utils.test.mjs`**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from '../own-it/scripts/lib/args.mjs';
import { check, RECIPE, ITEM } from '../own-it/scripts/lib/validate.mjs';
import { readJson, writeJson, writeJsVar } from '../own-it/scripts/lib/json.mjs';
import { toPosix, downloadsDir, SKILL_DIR } from '../own-it/scripts/lib/paths.mjs';
import { estimate } from '../own-it/scripts/lib/tokens.mjs';
import { tmpProject } from './helpers.mjs';

const CLI = join(SKILL_DIR, 'scripts', 'own-it.mjs');

test('parseArgs handles positionals, valued flags, boolean flags, = form', () => {
  assert.deepEqual(parseArgs(['scan', '--strings', 'trips', '--git-tracked', '--x=1']),
    { _: ['scan'], flags: { strings: 'trips', 'git-tracked': true, x: '1' } });
});

test('check reports exact field paths', () => {
  const errs = check({ mode: 'casual', missions: [{ zone: 'z', rung: 'map', board: 'pie', brief: 'b' }] }, RECIPE);
  assert.ok(errs.includes('mode: expected one of practice,exam'), errs.join('\n'));
  assert.ok(errs.includes('missions[0].board: expected one of component,swimlanes'), errs.join('\n'));
});

test('check requires ref and conf on items', () => {
  const errs = check({ id: 'c1', k: 'surface', label: 'x' }, ITEM);
  assert.ok(errs.includes('ref: required'));
  assert.ok(errs.includes('conf: required'));
});

test('json helpers: atomic write, fallback, invalid json error, js var', () => {
  const root = tmpProject({}, { git: false });
  const p = join(root, 'a', 'b.json');
  assert.deepEqual(readJson(p, { d: 1 }), { d: 1 });
  writeJson(p, { x: 1 });
  assert.deepEqual(readJson(p), { x: 1 });
  assert.equal(existsSync(p + '.tmp'), false);
  writeJsVar(join(root, 'v.js'), 'OWNIT_X', { y: 2 });
  assert.equal(readFileSync(join(root, 'v.js'), 'utf8'), 'window.OWNIT_X = {"y":2};\n');
  const bad = join(root, 'bad.json');
  writeFileSync(bad, '{nope');
  assert.throws(() => readJson(bad), /invalid JSON/);
});

test('paths: toPosix and downloads dir precedence', () => {
  assert.equal(toPosix('api\\trips.ts'), 'api/trips.ts');
  assert.equal(downloadsDir('/custom', {}), '/custom');
  assert.equal(downloadsDir(null, { OWNIT_DOWNLOADS: '/env' }), '/env');
  assert.match(downloadsDir(null, {}), /Downloads$/);
});

test('estimate is chars/4 rounded up, objects stringified', () => {
  assert.equal(estimate('abcd', 'e'), 2);
  assert.equal(estimate({ a: 1 }), 2); // {"a":1} = 7 chars
});

test('CLI: unknown command exits 1 with own-it: prefix', () => {
  const r = spawnSync(process.execPath, [CLI, 'nope'], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /^own-it: unknown command "nope"/);
});

test('CLI: no command prints usage and exits 1', () => {
  const r = spawnSync(process.execPath, [CLI], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /usage: own-it <init\|scan\|check-refs\|fog\|build-missions\|collect\|apply\|open>/);
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL, modules not found.

- [ ] **Step 5: Implement the modules**

`own-it/scripts/lib/args.mjs`:
```js
export function parseArgs(argv) {
  const out = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const eq = a.indexOf('=');
    if (eq > -1) { out.flags[a.slice(2, eq)] = a.slice(eq + 1); continue; }
    const name = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out.flags[name] = true;
    else { out.flags[name] = next; i++; }
  }
  return out;
}
```

`own-it/scripts/lib/paths.mjs`:
```js
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';

export const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const projectRoot = (env = process.env) => env.OWNIT_ROOT || process.cwd();
export const ownItPath = (root, ...parts) => join(root, '.own-it', ...parts);
export const toPosix = (p) => p.replace(/\\/g, '/');
export function downloadsDir(settingDir, env = process.env) {
  return settingDir || env.OWNIT_DOWNLOADS || join(homedir(), 'Downloads');
}
```

`own-it/scripts/lib/json.mjs`:
```js
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

export function readJson(path, fallback) {
  if (!existsSync(path)) {
    if (fallback !== undefined) return fallback;
    throw new Error(`missing file ${path}`);
  }
  try { return JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, '')); }
  catch { throw new Error(`invalid JSON in ${path}`); }
}

export function writeJson(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path + '.tmp', JSON.stringify(data, null, 1));
  renameSync(path + '.tmp', path);
}

export function writeJsVar(path, name, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `window.${name} = ${JSON.stringify(data)};\n`);
}
```

`own-it/scripts/lib/tokens.mjs`:
```js
export function estimate(...parts) {
  const chars = parts.reduce((n, p) => n + (typeof p === 'string' ? p : JSON.stringify(p) ?? '').length, 0);
  return Math.ceil(chars / 4);
}
```

`own-it/scripts/lib/validate.mjs` — mini validator. Schema node forms: `{type:'object', props, required?, extra?}`, `{type:'array', items, min?, max?}`, `{type:'string', enum?, pattern?, max?}`, `{type:'number', min?}`, `{type:'boolean'}`, `{type:'any'}`. Error strings: `<path>: required`, `<path>: expected <type>`, `<path>: expected one of a,b`, `<path>: does not match <pattern>`, `<path>: at most <n> items`, `<path>: at least <n> items`. Path format: `a.b[0].c`, root fields without leading dot.

```js
export function check(v, s, at = '') {
  const errs = [];
  const p = (k) => (at ? `${at}.${k}` : k);
  const isType = { object: (x) => x && typeof x === 'object' && !Array.isArray(x), array: Array.isArray,
    string: (x) => typeof x === 'string', number: (x) => typeof x === 'number' && Number.isFinite(x),
    boolean: (x) => typeof x === 'boolean', any: () => true };
  if (!isType[s.type](v)) return [`${at || '(root)'}: expected ${s.type}`];
  if (s.enum && !s.enum.includes(v)) errs.push(`${at}: expected one of ${s.enum.join(',')}`);
  if (s.pattern && !new RegExp(s.pattern).test(v)) errs.push(`${at}: does not match ${s.pattern}`);
  if (s.type === 'number' && s.min !== undefined && v < s.min) errs.push(`${at}: below ${s.min}`);
  if (s.type === 'array') {
    if (s.min !== undefined && v.length < s.min) errs.push(`${at}: at least ${s.min} items`);
    if (s.max !== undefined && v.length > s.max) errs.push(`${at}: at most ${s.max} items`);
    if (s.items) v.forEach((x, i) => errs.push(...check(x, s.items, `${at}[${i}]`)));
  }
  if (s.type === 'object') {
    for (const k of s.required || []) if (v[k] === undefined) errs.push(`${p(k)}: required`);
    for (const [k, sub] of Object.entries(s.props || {})) if (v[k] !== undefined) errs.push(...check(v[k], sub, p(k)));
  }
  return errs;
}

const str = { type: 'string' };
const ids = { type: 'array', items: str };
export const ITEM = { type: 'object', required: ['id', 'k', 'ref', 'conf'], props: {
  id: { type: 'string', pattern: '^[A-Za-z0-9_-]{1,24}$' },
  k: { type: 'string', enum: ['surface', 'component', 'edge', 'actor', 'role', 'permission', 'state', 'transition', 'flow', 'decision', 'failure', 'term'] },
  label: str, actor: str, from: str, to: str, by: str, card: str, threat: str, role: str, action: str,
  steps: { type: 'array', items: ids },
  ref: { type: 'string', pattern: '^[^:]+:\\d+$' },
  conf: { type: 'string', enum: ['high', 'medium', 'low'] },
  outside: { type: 'boolean' } } };
export const EXTRACTION = { type: 'object', required: ['zone', 'files', 'items'], props: {
  zone: str, files: ids, items: { type: 'array', items: ITEM, max: 80 } } };
export const ZONES = { type: 'object', required: ['zones'], props: { zones: { type: 'array', min: 1, items: {
  type: 'object', required: ['id', 'name', 'paths'], props: {
    id: { type: 'string', pattern: '^[a-z0-9-]{1,24}$' }, name: str, paths: { type: 'array', min: 1, items: str } } } } } };
export const RECIPE = { type: 'object', required: ['mode', 'missions'], props: {
  mode: { type: 'string', enum: ['practice', 'exam'] },
  missions: { type: 'array', min: 1, max: 8, items: { type: 'object', required: ['zone', 'rung', 'board', 'brief'], props: {
    zone: str, rung: { type: 'string', enum: ['map', 'trace', 'break', 'boss'] },
    board: { type: 'string', enum: ['component', 'swimlanes'] },
    brief: { type: 'string', max: 300 }, cards: { type: 'array', items: str, max: 15 },
    flow: str, threats: ids, refresh: { type: 'boolean' },
    pins: { type: 'array', max: 3, items: { type: 'object', required: ['card', 'q'], props: { card: str, q: { type: 'string', max: 160 } } } } } } } } };
export const ANSWER = { type: 'object', required: ['id', 'submittedAt', 'got', 'of', 'missed', 'text', 'hintsUsed'], props: {
  id: str, submittedAt: str, got: { type: 'number', min: 0 }, of: { type: 'number', min: 0 },
  missed: ids, wrong: { type: 'array', items: { type: 'any' } }, text: { type: 'object' },
  hintsUsed: { type: 'number', min: 0 }, challenges: ids } };
```

`own-it/scripts/own-it.mjs`:
```js
#!/usr/bin/env node
import { parseArgs } from './lib/args.mjs';
import { projectRoot } from './lib/paths.mjs';

const COMMANDS = ['init', 'scan', 'check-refs', 'fog', 'build-missions', 'collect', 'apply', 'open'];
const USAGE = `usage: own-it <${COMMANDS.join('|')}> [args]`;

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd) throw new Error(USAGE);
  if (!COMMANDS.includes(cmd)) throw new Error(`unknown command "${cmd}". ${USAGE}`);
  const mod = await import(`./lib/cmd-${cmd}.mjs`);
  const ctx = { root: projectRoot(), now: () => new Date(), env: process.env };
  const out = await mod.run(parseArgs(rest), ctx);
  process.stdout.write((typeof out === 'string' ? out : JSON.stringify(out)) + '\n');
}

main().catch((e) => {
  process.stderr.write(`own-it: ${e.message}\n`);
  process.exit(1);
});
```
For the no-command case stderr is `own-it: usage: own-it <init|...> [args]`, which the test regex matches.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (8 tests).

- [ ] **Step 7: Commit**

```bash
git add package.json .gitignore own-it/scripts tests
git commit -m "feat(own-it): CLI scaffold, args, paths, json, validation, token estimate"
```

---

### Task 2: File walker and blob hashes

**Files:**
- Create: `own-it/scripts/lib/walk.mjs`, `own-it/scripts/lib/hash.mjs`
- Test: `tests/walk-hash.test.mjs`

**Interfaces:**
- Consumes: `toPosix` (Task 1)
- Produces:
  - `listFiles(root) → string[]` sorted POSIX relative paths. Skips dirs `node_modules .git .own-it dist build out coverage vendor venv .venv __pycache__ .next .nuxt target .idea .vscode`, skips files > 512 KB and binary extensions (`isBinaryPath`).
  - `isBinaryPath(p) → boolean` (png jpg jpeg gif webp ico svg pdf zip gz tar mp4 mp3 woff woff2 ttf eot lock exe dll so dylib class jar bin`), also `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`.
  - `blobHash(buf: Buffer|string) → string` identical to `git hash-object`.
  - `hashesFor(root, files: string[]) → { git: boolean, hashes: Record<string, string|null> }`. In a git repo with a HEAD commit: committed blob hashes from `git ls-tree -r HEAD` (uncommitted edits ignored; files not in HEAD → `null`). Without git or without commits: `git:false`, `blobHash` of working file (missing → `null`).
  - `lineCount(root, file) → number` (0 if missing; counts `\r?\n` lines, final line without newline counts).

- [ ] **Step 1: Write failing tests `tests/walk-hash.test.mjs`**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { listFiles } from '../own-it/scripts/lib/walk.mjs';
import { blobHash, hashesFor, lineCount } from '../own-it/scripts/lib/hash.mjs';
import { tmpProject, writeFiles, commit } from './helpers.mjs';

test('listFiles skips ignored dirs, binaries, lockfiles, big files', () => {
  const root = tmpProject({
    'src/a.ts': 'x', 'src/b.png': 'x', 'node_modules/m/i.js': 'x', '.own-it/p.json': '{}',
    'package-lock.json': '{}', 'big.txt': 'a'.repeat(600 * 1024), 'docs/readme.md': 'hi',
  }, { git: false });
  assert.deepEqual(listFiles(root), ['docs/readme.md', 'src/a.ts']);
});

test('blobHash equals git hash-object', () => {
  const root = tmpProject({ 'f.txt': 'hello\nworld\n' }, { git: false });
  const git = execFileSync('git', ['hash-object', join(root, 'f.txt')], { encoding: 'utf8' }).trim();
  assert.equal(blobHash('hello\nworld\n'), git);
});

test('hashesFor uses committed blobs and ignores uncommitted edits', () => {
  const root = tmpProject({ 'a.js': 'one\n' });
  const before = hashesFor(root, ['a.js', 'nope.js']);
  assert.equal(before.git, true);
  assert.equal(before.hashes['a.js'], blobHash('one\n'));
  assert.equal(before.hashes['nope.js'], null);
  writeFiles(root, { 'a.js': 'two\n' });
  assert.equal(hashesFor(root, ['a.js']).hashes['a.js'], blobHash('one\n'));
  commit(root, 'edit');
  assert.equal(hashesFor(root, ['a.js']).hashes['a.js'], blobHash('two\n'));
});

test('hashesFor without git or without commits falls back to content hash', () => {
  const noGit = tmpProject({ 'a.js': 'x\n' }, { git: false });
  assert.deepEqual(hashesFor(noGit, ['a.js']), { git: false, hashes: { 'a.js': blobHash('x\n') } });
  const noCommit = tmpProject({ 'a.js': 'x\n' }, { git: true, commitFiles: false });
  assert.equal(hashesFor(noCommit, ['a.js']).git, false);
});

test('lineCount handles CRLF, no trailing newline, missing file', () => {
  const root = tmpProject({ 'crlf.txt': 'a\r\nb\r\nc', 'lf.txt': 'a\nb\n' }, { git: false });
  assert.equal(lineCount(root, 'crlf.txt'), 3);
  assert.equal(lineCount(root, 'lf.txt'), 2);
  assert.equal(lineCount(root, 'missing.txt'), 0);
});
```

- [ ] **Step 2: Run to verify failure** — Run: `npm test` — Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`own-it/scripts/lib/hash.mjs` core:
```js
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

export function blobHash(content) {
  const buf = Buffer.isBuffer(content) ? content : Buffer.from(content);
  return createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');
}

function committed(root) {
  try {
    const out = execFileSync('git', ['ls-tree', '-r', '--full-tree', 'HEAD'],
      { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
    const prefix = execFileSync('git', ['rev-parse', '--show-prefix'],
      { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const map = new Map();
    for (const line of out.split('\n')) {
      const m = line.match(/^\d+ blob ([0-9a-f]+)\t(.+)$/);
      if (m && m[2].startsWith(prefix)) map.set(m[2].slice(prefix.length), m[1]);
    }
    return map;
  } catch { return null; }
}

export function hashesFor(root, files) {
  const map = committed(root);
  const hashes = {};
  for (const f of files) {
    if (map) hashes[f] = map.get(f) ?? null;
    else { const p = join(root, f); hashes[f] = existsSync(p) ? blobHash(readFileSync(p)) : null; }
  }
  return { git: !!map, hashes };
}

export function lineCount(root, file) {
  const p = join(root, file);
  if (!existsSync(p)) return 0;
  const s = readFileSync(p, 'utf8');
  if (s === '') return 0;
  const n = s.split(/\r?\n/).length;
  return /\r?\n$/.test(s) ? n - 1 : n;
}
```
Note `git ls-tree` quotes paths with special characters; pass `-z` instead and split on `\0` if you see quoting in tests. Use `-z` from the start:
`['ls-tree', '-r', '-z', '--full-tree', 'HEAD']`, split on `'\0'`, regex `/^\d+ blob ([0-9a-f]+)\t([\s\S]+)$/`.

`own-it/scripts/lib/walk.mjs`: recursive `readdirSync(dir, { withFileTypes: true })`, skip symlinks, apply the skip lists above, `statSync(p).size > 512*1024` skip, return sorted `toPosix(relative(root, p))`.

- [ ] **Step 4: Run tests** — Run: `npm test` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add own-it/scripts/lib/walk.mjs own-it/scripts/lib/hash.mjs tests/walk-hash.test.mjs
git commit -m "feat(own-it): file walker and git-compatible blob hashes"
```

---

### Task 3: `scan` command and pattern pack

**Files:**
- Create: `own-it/assets/patterns.json`, `own-it/scripts/lib/cmd-scan.mjs`, `own-it/scripts/lib/model.mjs` (only `loadModel`, `zoneFiles` here; `saveModel` too)
- Test: `tests/scan.test.mjs`

**Interfaces:**
- Consumes: `listFiles`, `readJson`, `ownItPath`, `SKILL_DIR`
- Produces:
  - `loadModel(root) → { version:1, zones: Record<id, { name, paths: string[], files: Record<path,hash|null>, items: Item[] }> }` (default `{version:1, zones:{}}`), `saveModel(root, model)` → `.own-it/model.json`
  - `zoneFiles(root, zone) → string[]` = `listFiles(root)` filtered by `paths` prefixes (a path `api/trips` matches `api/trips.ts` and `api/trips/x.ts`; exact file paths match themselves)
  - `scan` (no flags) → `{frameworks: string[], fileCount: number, dirs: Record<string,number>, candidates: {k,label,ref}[], truncated: boolean}`; `dirs` counts files per directory truncated to its first two segments (`app/driver/Trip.tsx` → `app/driver`, `api/trips.ts` → `api`, root files → `.`); candidates capped at 300
  - `scan --strings <zone>` → `{zone, terms: {t, kind, n, refs: string[]}[]}`; refs capped at 3 per term; terms sorted by `n` desc then `t`; capped at 60. Error if zone unknown: `unknown zone "<id>"; run init --zones first`
- `patterns.json` shape:
```json
{
  "frameworks": {
    "<name>": { "detect": { "npm": ["pkg"], "pip": ["pkg"], "gem": ["pkg"], "files": ["glob-ish suffix"] },
                "patterns": [ { "k": "surface", "re": "regex", "label": "$1 $2", "upper1": true, "ext": [".js"] } ] }
  },
  "generic": [ { "k": "...", "re": "...", "label": "...", "ext": [...] } ],
  "strings": [ { "kind": "ui|enum|model|status", "re": "regex with one capture group", "ext": [...] } ]
}
```
`label` substitutes `$1..$9`; `upper1` uppercases capture 1. Detection: `npm` from `package.json` dependencies+devDependencies (any `package.json` in the tree), `pip` from `requirements.txt`/`pyproject.toml` text contains, `gem` from `Gemfile` contains. Regexes are compiled with flag `g` and matched per line; ref = `file:lineNumber` (1-based).

- [ ] **Step 1: Write `own-it/assets/patterns.json`** with at least these entries (regexes are JSON-escaped):

```json
{
  "frameworks": {
    "express": { "detect": { "npm": ["express"] }, "patterns": [
      { "k": "surface", "re": "\\b(?:app|router|r)\\.(get|post|put|patch|delete)\\(\\s*['\"`]([^'\"`]+)['\"`]", "label": "$1 $2", "upper1": true, "ext": [".js", ".ts", ".mjs", ".cjs"] } ] },
    "react-router": { "detect": { "npm": ["react-router", "react-router-dom"] }, "patterns": [
      { "k": "surface", "re": "<Route\\b[^>]*\\bpath=['\"{`]+([^'\"}`]+)", "label": "screen $1", "ext": [".jsx", ".tsx", ".js", ".ts"] },
      { "k": "surface", "re": "\\bpath:\\s*['\"`]([^'\"`]+)['\"`]", "label": "screen $1", "ext": [".jsx", ".tsx", ".js", ".ts"] } ] },
    "next": { "detect": { "npm": ["next"] }, "patterns": [
      { "k": "surface", "re": "export\\s+(?:async\\s+)?function\\s+(GET|POST|PUT|PATCH|DELETE)\\b", "label": "route $1", "ext": [".js", ".ts"] },
      { "k": "surface", "re": "export\\s+default\\s+(?:async\\s+)?function\\s+(\\w*Page)\\b", "label": "page $1", "ext": [".jsx", ".tsx"] } ] },
    "fastapi": { "detect": { "pip": ["fastapi"] }, "patterns": [
      { "k": "surface", "re": "@\\w+\\.(get|post|put|patch|delete)\\(\\s*['\"]([^'\"]+)", "label": "$1 $2", "upper1": true, "ext": [".py"] } ] },
    "flask": { "detect": { "pip": ["flask"] }, "patterns": [
      { "k": "surface", "re": "@\\w+\\.route\\(\\s*['\"]([^'\"]+)", "label": "route $1", "ext": [".py"] } ] },
    "django": { "detect": { "pip": ["django"] }, "patterns": [
      { "k": "surface", "re": "\\b(?:re_)?path\\(\\s*r?['\"]([^'\"]*)['\"]", "label": "route /$1", "ext": [".py"] } ] },
    "rails": { "detect": { "gem": ["rails"] }, "patterns": [
      { "k": "surface", "re": "^\\s*(get|post|put|patch|delete)\\s+['\"]([^'\"]+)", "label": "$1 $2", "upper1": true, "ext": [".rb"] },
      { "k": "surface", "re": "^\\s*resources?\\s+:(\\w+)", "label": "resource $1", "ext": [".rb"] } ] },
    "cli-node": { "detect": { "npm": ["commander", "yargs"] }, "patterns": [
      { "k": "surface", "re": "\\.command\\(\\s*['\"`]([\\w:-]+)", "label": "command $1", "ext": [".js", ".ts", ".mjs"] } ] }
  },
  "generic": [
    { "k": "state", "re": "\\benum\\s+(\\w*(?:Status|State)\\w*)", "label": "enum $1", "ext": [".ts", ".tsx", ".java", ".kt", ".cs", ".rs", ".swift"] },
    { "k": "state", "re": "\\bclass\\s+(\\w*(?:Status|State)\\w*)\\s*\\(\\s*(?:str\\s*,\\s*)?(?:Enum|TextChoices|IntEnum)", "label": "enum $1", "ext": [".py"] },
    { "k": "state", "re": "\\b(?:const|let|var)\\s+(\\w*(?:STATUS|Status|STATE|State)\\w*)\\s*=\\s*[\\[{]", "label": "status set $1", "ext": [".js", ".ts", ".jsx", ".tsx", ".mjs"] },
    { "k": "role", "re": "\\b(requireRole|hasRole|authorize|checkRole|can|isAdmin|isManager|requirePermission)\\s*\\(\\s*['\"`]?(\\w*)", "label": "role check $1 $2", "ext": [".js", ".ts", ".jsx", ".tsx", ".mjs", ".py", ".rb"] },
    { "k": "role", "re": "@(PreAuthorize|RolesAllowed|permission_required|login_required)\\b", "label": "role check $1", "ext": [".java", ".kt", ".py"] }
  ],
  "strings": [
    { "kind": "ui", "re": ">\\s*([A-Z][A-Za-z ]{1,38}[A-Za-z])\\s*<", "ext": [".jsx", ".tsx", ".html", ".vue", ".svelte"] },
    { "kind": "ui", "re": "\\b(?:title|label|placeholder|aria-label)=['\"]([A-Za-z][A-Za-z ]{1,38})['\"]", "ext": [".jsx", ".tsx", ".html", ".vue", ".svelte"] },
    { "kind": "status", "re": "\\b(?:status|state)\\s*[:=]+\\s*['\"]([a-z][a-z_]{2,30})['\"]", "ext": [".js", ".ts", ".jsx", ".tsx", ".mjs", ".py", ".rb"] },
    { "kind": "enum", "re": "^\\s*([A-Z][A-Z_]{2,30})\\s*[=,:]", "ext": [".ts", ".py", ".java", ".kt", ".cs"] },
    { "kind": "model", "re": "\\b(?:class|interface|type|model)\\s+([A-Z][A-Za-z]{2,30})\\b", "ext": [".ts", ".tsx", ".py", ".rb", ".java", ".kt", ".prisma"] }
  ]
}
```

- [ ] **Step 2: Write failing tests `tests/scan.test.mjs`**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { run as scan } from '../own-it/scripts/lib/cmd-scan.mjs';
import { saveModel, zoneFiles } from '../own-it/scripts/lib/model.mjs';
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
```
Note on `zoneFiles`: `api/trips` matches `api/trips.ts` because a prefix followed by `.` (same basename) or `/` counts. `api/tripsy.ts` must not match.

- [ ] **Step 3: Run to verify failure** — `npm test` — FAIL.

- [ ] **Step 4: Implement `model.mjs` and `cmd-scan.mjs`**

`model.mjs`:
```js
import { readJson, writeJson } from './json.mjs';
import { ownItPath } from './paths.mjs';
import { listFiles } from './walk.mjs';

export const loadModel = (root) => readJson(ownItPath(root, 'model.json'), { version: 1, zones: {} });
export const saveModel = (root, m) => writeJson(ownItPath(root, 'model.json'), m);

export function matchesPath(file, prefix) {
  const p = prefix.replace(/\/+$/, '');
  if (file === p || file.startsWith(p + '/')) return true;
  const base = file.slice(0, file.lastIndexOf('.'));
  return base === p;
}
export const zoneFiles = (root, zone) => listFiles(root).filter((f) => zone.paths.some((p) => matchesPath(f, p)));
```

`cmd-scan.mjs`: load `patterns.json` from `join(SKILL_DIR, 'assets', 'patterns.json')`; detect frameworks; for each file whose extension is in a pattern's `ext`, read text, split lines on `/\r?\n/`, run each regex (`new RegExp(re, 'g')`) per line with `matchAll`, build label by replacing `$n` (uppercase `$1` when `upper1`), dedupe by `k|label|ref`. Strings mode: collect `{t, kind}` keyed by `t`, count `n`, push up to 3 refs, sort, slice 60.

- [ ] **Step 5: Run tests** — `npm test` — PASS.

- [ ] **Step 6: Commit**

```bash
git add own-it/assets/patterns.json own-it/scripts/lib/cmd-scan.mjs own-it/scripts/lib/model.mjs tests/scan.test.mjs
git commit -m "feat(own-it): skeleton scan, words pass, pattern pack"
```

---

### Task 4: Progress store and `init`

**Files:**
- Create: `own-it/scripts/lib/progress.mjs`, `own-it/scripts/lib/cmd-init.mjs`
- Test: `tests/init.test.mjs`

**Interfaces:**
- Consumes: `readJson`, `writeJson`, `writeJsVar`, `ownItPath`, `SKILL_DIR`, `check`, `ZONES`, `loadModel`, `saveModel`
- Produces:
  - `RUNGS = ['words','map','trace','break','boss']`
  - `defaultZoneProgress(name) → { name, rungs: {words:'open', map:'locked', trace:'locked', break:'locked', boss:'locked'}, claimHashes: {}, surfacesCovered: [], claimed:false, fogged:false, weakSpots: [] }`
  - `defaultProgress() → { version:1, xp:0, badges:[], curiosity:0, fogClears:0, seq:0, zones:{}, finalBoss:'locked', tokens:[], settings:{ gitTracked:false, downloadDir:null } }`
  - `loadProgress(root)`, `saveProgress(root, p)` (writes `.own-it/progress.json` and `.own-it/progress.js` as `window.OWNIT_PROGRESS`)
  - `init --zones <file> [--git-tracked]` → `{created: boolean, zones: string[], gitTracked: boolean}`. Copies `assets/game.html` and `assets/core.js` into `.own-it/` (skip a source file that does not exist yet; Task 13 adds `game.html`), writes `.own-it/.gitignore` with `*\n` unless `--git-tracked` (removes it if tracked), merges zones: new ids get empty model zone + default progress; existing ids keep items/progress but update `name`/`paths`; ids missing from the file are removed from model and progress. Idempotent.
  - Error on invalid zones file: `invalid zones file: <first 5 errors joined by "; ">`

- [ ] **Step 1: Write failing tests `tests/init.test.mjs`**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { run as init } from '../own-it/scripts/lib/cmd-init.mjs';
import { loadProgress } from '../own-it/scripts/lib/progress.mjs';
import { loadModel, saveModel } from '../own-it/scripts/lib/model.mjs';
import { tmpProject, ctx } from './helpers.mjs';

function zonesFile(root, zones) {
  const p = join(root, 'zones.json');
  writeFileSync(p, JSON.stringify({ zones }));
  return p;
}

test('init creates .own-it with self-ignoring .gitignore, model, progress, progress.js', async () => {
  const root = tmpProject({ 'api/trips.ts': '' });
  const out = await init({ _: [], flags: { zones: zonesFile(root, [{ id: 'trips', name: 'Trips', paths: ['api'] }]) } }, ctx(root));
  assert.deepEqual(out, { created: true, zones: ['trips'], gitTracked: false });
  assert.equal(readFileSync(join(root, '.own-it', '.gitignore'), 'utf8'), '*\n');
  assert.equal(existsSync(join(root, '.gitignore')), false);
  assert.equal(loadProgress(root).zones.trips.rungs.words, 'open');
  assert.equal(loadProgress(root).zones.trips.rungs.map, 'locked');
  assert.deepEqual(loadModel(root).zones.trips.paths, ['api']);
  assert.match(readFileSync(join(root, '.own-it', 'progress.js'), 'utf8'), /^window\.OWNIT_PROGRESS = /);
});

test('init --git-tracked removes the self-ignore', async () => {
  const root = tmpProject({});
  const zf = zonesFile(root, [{ id: 'a', name: 'A', paths: ['x'] }]);
  await init({ _: [], flags: { zones: zf } }, ctx(root));
  const out = await init({ _: [], flags: { zones: zf, 'git-tracked': true } }, ctx(root));
  assert.equal(out.gitTracked, true);
  assert.equal(existsSync(join(root, '.own-it', '.gitignore')), false);
  assert.equal(loadProgress(root).settings.gitTracked, true);
});

test('re-init merges zones: keeps items of kept zones, drops removed, adds new', async () => {
  const root = tmpProject({});
  await init({ _: [], flags: { zones: zonesFile(root, [{ id: 'a', name: 'A', paths: ['x'] }, { id: 'b', name: 'B', paths: ['y'] }]) } }, ctx(root));
  const m = loadModel(root);
  m.zones.a.items = [{ id: 'c1', k: 'surface', label: 'L', ref: 'x:1', conf: 'high' }];
  saveModel(root, m);
  const out = await init({ _: [], flags: { zones: zonesFile(root, [{ id: 'a', name: 'A2', paths: ['x', 'z'] }, { id: 'c', name: 'C', paths: ['w'] }]) } }, ctx(root));
  assert.equal(out.created, false);
  const m2 = loadModel(root);
  assert.deepEqual(Object.keys(m2.zones).sort(), ['a', 'c']);
  assert.equal(m2.zones.a.items.length, 1);
  assert.equal(m2.zones.a.name, 'A2');
  assert.deepEqual(Object.keys(loadProgress(root).zones).sort(), ['a', 'c']);
});

test('init rejects invalid zones file with field errors', async () => {
  const root = tmpProject({});
  await assert.rejects(init({ _: [], flags: { zones: zonesFile(root, [{ id: 'Bad Id', name: 'x', paths: [] }]) } }, ctx(root)),
    /invalid zones file: zones\[0\]\.id: does not match/);
});

test('init requires --zones', async () => {
  await assert.rejects(init({ _: [], flags: {} }, ctx(tmpProject({}))), /--zones <file> is required/);
});
```

- [ ] **Step 2: Run to verify failure** — `npm test` — FAIL.

- [ ] **Step 3: Implement `progress.mjs` and `cmd-init.mjs`** per the interface. `created` is `true` when `.own-it/progress.json` did not exist before the call.

- [ ] **Step 4: Run tests** — `npm test` — PASS.

- [ ] **Step 5: Commit**

```bash
git add own-it/scripts/lib/progress.mjs own-it/scripts/lib/cmd-init.mjs tests/init.test.mjs
git commit -m "feat(own-it): progress store and idempotent init with zone merge"
```

---

### Task 5: `check-refs` — verify and merge extraction output

**Files:**
- Create: `own-it/scripts/lib/cmd-check-refs.mjs`
- Test: `tests/check-refs.test.mjs`

**Interfaces:**
- Consumes: `check`, `EXTRACTION`, `ITEM`, `loadModel`, `saveModel`, `hashesFor`, `lineCount`, `toPosix`, `loadProgress`, `saveProgress`, `estimate`
- Produces: `check-refs <extraction.json>` → `{zone, kept, dropped: {id, why}[], est}` where `why ∈ 'invalid' | 'no-file' | 'bad-line' | 'dangling' | 'dup-id' | 'outside-zone'`.
  Rules, in order:
  1. Top-level must pass `EXTRACTION`; zone must exist in model, else throw `unknown zone "<id>"`. Throw on top-level errors: `invalid extraction: <errors>`.
  2. Normalize every `ref` with `toPosix`. Item failing `ITEM` → `invalid`. Duplicate `id` within the file → `dup-id` (later one dropped).
  3. Ref file missing → `no-file`. Line `< 1` or `> lineCount` → `bad-line`.
  4. Ref file not in `zoneFiles(zone)` and item has no `outside: true` → `outside-zone`.
  5. Referential integrity, repeated until stable: `edge` needs `from`,`to` present among kept item ids; `transition` needs `from`,`to` among kept `state` ids; `flow` needs every step id among kept ids; `failure` needs `card` among kept ids; `permission` needs `role` among kept ids. Missing → `dangling`.
  6. Merge: remove existing zone items whose ref file is in `extraction.files`, then append kept items. If an incoming id collides with a remaining existing id, the incoming item replaces it.
  7. Update `model.zones[z].files` with `hashesFor(root, zoneFiles)` for all zone files.
  8. Append `{t: ctx.now().toISOString(), kind:'extraction', zone, est}` to `progress.tokens`, where `est = estimate(<raw extraction file text>)`.

- [ ] **Step 1: Write failing tests `tests/check-refs.test.mjs`**

```js
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
```

- [ ] **Step 2: Run to verify failure** — `npm test` — FAIL.
- [ ] **Step 3: Implement `cmd-check-refs.mjs`** per the rules above.
- [ ] **Step 4: Run tests** — `npm test` — PASS.
- [ ] **Step 5: Commit**

```bash
git add own-it/scripts/lib/cmd-check-refs.mjs tests/check-refs.test.mjs
git commit -m "feat(own-it): check-refs verifies and merges extraction output"
```

---

### Task 6: `fog` — stale items, fogged zones, status line

**Files:**
- Create: `own-it/scripts/lib/cmd-fog.mjs`
- Test: `tests/fog.test.mjs`

**Interfaces:**
- Consumes: `loadModel`, `saveModel`, `zoneFiles`, `hashesFor`, `loadProgress`, `saveProgress`
- Produces: `fog` → `{git, xp, badges, weak, zones: {id, name, rungs: string, fogged, stale: string[]}[]}` where `rungs` is a 5-char string over `RUNGS` with `c`=cleared, `o`=open, `-`=locked (e.g. `"cco--"`), `stale` = zone files whose current hash differs from `model.zones[z].files` (new files with no stored hash count as stale; at most 20 listed). A zone is `fogged` when any rung in `claimHashes` has a file whose current hash differs from the stored claim hash. Writes `fogged` flags to progress. When `git:false`, `fogged` is always `false` and `stale` still works by content hash.

- [ ] **Step 1: Write failing tests `tests/fog.test.mjs`**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { run as init } from '../own-it/scripts/lib/cmd-init.mjs';
import { run as checkRefs } from '../own-it/scripts/lib/cmd-check-refs.mjs';
import { run as fog } from '../own-it/scripts/lib/cmd-fog.mjs';
import { loadProgress, saveProgress } from '../own-it/scripts/lib/progress.mjs';
import { hashesFor } from '../own-it/scripts/lib/hash.mjs';
import { tmpProject, writeFiles, commit, ctx } from './helpers.mjs';

async function setup(opts) {
  const root = tmpProject({ 'api/trips.ts': 'a\nb\n', 'app/T.tsx': 'x\n' }, opts);
  writeFileSync(join(root, 'zones.json'), JSON.stringify({ zones: [{ id: 'trips', name: 'Trips', paths: ['api', 'app'] }] }));
  await init({ _: [], flags: { zones: join(root, 'zones.json') } }, ctx(root));
  writeFileSync(join(root, 'ex.json'), JSON.stringify({ zone: 'trips', files: ['api/trips.ts', 'app/T.tsx'], items: [
    { id: 'c1', k: 'surface', label: 'api', ref: 'api/trips.ts:1', conf: 'high' }] }));
  await checkRefs({ _: [join(root, 'ex.json')], flags: {} }, ctx(root));
  return root;
}

function claimMap(root) {
  const p = loadProgress(root);
  p.zones.trips.rungs.words = 'cleared';
  p.zones.trips.rungs.map = 'cleared';
  p.zones.trips.rungs.trace = 'open';
  p.zones.trips.claimHashes.map = hashesFor(root, ['api/trips.ts', 'app/T.tsx']).hashes;
  saveProgress(root, p);
}

test('clean zone: no fog, no stale, rung string', async () => {
  const root = await setup();
  claimMap(root);
  const out = await fog({ _: [], flags: {} }, ctx(root));
  assert.equal(out.git, true);
  assert.deepEqual(out.zones, [{ id: 'trips', name: 'Trips', rungs: 'cco--', fogged: false, stale: [] }]);
});

test('uncommitted edit does not fog; committed edit fogs and marks stale', async () => {
  const root = await setup();
  claimMap(root);
  writeFiles(root, { 'api/trips.ts': 'changed\n' });
  assert.equal((await fog({ _: [], flags: {} }, ctx(root))).zones[0].fogged, false);
  commit(root, 'change');
  const out = await fog({ _: [], flags: {} }, ctx(root));
  assert.equal(out.zones[0].fogged, true);
  assert.deepEqual(out.zones[0].stale, ['api/trips.ts']);
  assert.equal(loadProgress(root).zones.trips.fogged, true);
});

test('new committed file in zone is stale', async () => {
  const root = await setup();
  writeFiles(root, { 'app/New.tsx': 'n\n' });
  commit(root, 'new');
  assert.deepEqual((await fog({ _: [], flags: {} }, ctx(root))).zones[0].stale, ['app/New.tsx']);
});

test('non-git project: git false, never fogged, stale by content', async () => {
  const root = await setup({ git: false });
  claimMap(root);
  writeFiles(root, { 'api/trips.ts': 'changed\n' });
  const out = await fog({ _: [], flags: {} }, ctx(root));
  assert.equal(out.git, false);
  assert.equal(out.zones[0].fogged, false);
  assert.deepEqual(out.zones[0].stale, ['api/trips.ts']);
});
```

- [ ] **Step 2: Run to verify failure** — `npm test` — FAIL.
- [ ] **Step 3: Implement `cmd-fog.mjs`.** `weak` = total `weakSpots` length; `badges` = `progress.badges.length`.
- [ ] **Step 4: Run tests** — `npm test` — PASS.
- [ ] **Step 5: Commit**

```bash
git add own-it/scripts/lib/cmd-fog.mjs tests/fog.test.mjs
git commit -m "feat(own-it): fog and stale detection from committed blob hashes"
```

---

### Task 7: `core.js` — codec and graders shared by page and Node

**Files:**
- Create: `own-it/assets/core.js`, `own-it/scripts/lib/core.mjs`
- Test: `tests/core.test.mjs`

**Interfaces:**
- Produces global `OwnItCore` (browser) and `module.exports` (Node) with:
  - `KEY: string` = `'own-it:anti-spoiler:v1'`
  - `encode(obj) → string` base64 of UTF-8 JSON bytes XOR-ed with `KEY` bytes; `decode(str) → obj`. Own base64 implementation (no `btoa`/`Buffer`) so both environments match. Uses `TextEncoder`/`TextDecoder`.
  - `toBase64(bytes: Uint8Array) → string`, `fromBase64(str) → Uint8Array` (standard alphabet, `=` padding)
  - `gradeComponent(answer, userEdges)`: `answer = { edges: {id, from, to}[] }`, `userEdges = [from, to][]` (directed, duplicates ignored) → `{ got, of, missed: edgeId[], wrong: [from,to][] }`; `of = answer.edges.length`
  - `gradeSwimlanes(answer, placed)`: `answer = { steps: string[][], lanes: Record<cardId, lane> }`, `placed = {id, lane}[]` in the user's left-to-right order → `{ got, of, missed: cardId[], wrong: [] }`. Algorithm: map each placed card to its group index (skip cards not in the answer), take the longest non-decreasing subsequence of group indices (ties: prefer earliest), each card in it scores 1 if its lane matches else 0.5; `of` = number of answer cards; `missed` = answer cards not in the subsequence or not placed.
  - `gradeBreak(answer, placements)`: `answer = { threats: {id, card}[] }`, `placements: Record<threatId, cardId>` → `{ got, of, missed: threatId[], wrong: [threatId, cardId][] }`
  - `matchLabels(boxes, cards)`: `boxes = {uid, label}[]`, `cards = {id, label}[]` → `Record<uid, cardId>`. Normalize: lowercase, split on non-alphanumerics, drop empty and stopwords (`the a an of to and for in on`). Score = Jaccard of token sets. Greedy one-to-one by highest score; accept score ≥ 0.5.
  - `gradeBoss(answer, boxes, userEdges)`: `answer = { cards: {id,label}[], edges: {id,from,to}[] }`, `userEdges = [uidFrom, uidTo][]` → maps boxes with `matchLabels`, converts edges, then `{ got: matchedCards + correctEdges, of: cards + edges, missed: [...unmatched card ids, ...missed edge ids], wrong }`
  - `payload(missionId, result, text, hintsUsed, challenges, now: Date)` → `{ id, submittedAt: now.toISOString(), got, of, missed, text, hintsUsed, challenges }` plus `wrong` only when non-empty.
- `own-it/scripts/lib/core.mjs`: `import { createRequire } from 'node:module'; const require = createRequire(import.meta.url); export default require('../../assets/core.js');`

- [ ] **Step 1: Write failing tests `tests/core.test.mjs`**

```js
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
```

- [ ] **Step 2: Run to verify failure** — `npm test` — FAIL.

- [ ] **Step 3: Implement `own-it/assets/core.js`** (UMD wrapper; key parts):

```js
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OwnItCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const KEY = 'own-it:anti-spoiler:v1';
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

  function toBase64(bytes) {
    let out = '';
    for (let i = 0; i < bytes.length; i += 3) {
      const n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0);
      out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] +
        (i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=') + (i + 2 < bytes.length ? B64[n & 63] : '=');
    }
    return out;
  }
  function fromBase64(str) {
    const clean = str.replace(/[^A-Za-z0-9+/]/g, '');
    const out = [];
    for (let i = 0; i < clean.length; i += 4) {
      const n = (B64.indexOf(clean[i]) << 18) | (B64.indexOf(clean[i + 1]) << 12) |
        ((B64.indexOf(clean[i + 2]) & 63) << 6) | (B64.indexOf(clean[i + 3]) & 63);
      out.push((n >> 16) & 255);
      if (i + 2 < clean.length) out.push((n >> 8) & 255);
      if (i + 3 < clean.length) out.push(n & 255);
    }
    return Uint8Array.from(out);
  }
  function xor(bytes) {
    const k = new TextEncoder().encode(KEY);
    return bytes.map((b, i) => b ^ k[i % k.length]);
  }
  const encode = (obj) => toBase64(xor(new TextEncoder().encode(JSON.stringify(obj))));
  const decode = (str) => JSON.parse(new TextDecoder().decode(xor(fromBase64(str))));

  function longestNonDecreasing(seq) { // seq: {g, idx}[]; returns indices into seq
    const n = seq.length, len = Array(n).fill(1), prev = Array(n).fill(-1);
    for (let i = 0; i < n; i++) for (let j = 0; j < i; j++)
      if (seq[j].g <= seq[i].g && len[j] + 1 > len[i]) { len[i] = len[j] + 1; prev[i] = j; }
    let best = -1;
    for (let i = 0; i < n; i++) if (best < 0 || len[i] > len[best]) best = i;
    const out = [];
    for (let i = best; i >= 0; i = prev[i]) out.unshift(i);
    return out;
  }
  // gradeComponent, gradeSwimlanes, gradeBreak, matchLabels, gradeBoss, payload per the interface
  return { KEY, encode, decode, toBase64, fromBase64, gradeComponent, gradeSwimlanes, gradeBreak, matchLabels, gradeBoss, payload };
});
```
Careful: `fromBase64` must ignore padding when computing output length: a 4-char block with `==` yields 1 byte, with `=` yields 2. Because `clean` strips `=`, use the remaining chars in the block: `chars = min(4, clean.length - i)`; bytes = `chars - 1`.

- [ ] **Step 4: Run tests** — `npm test` — PASS.
- [ ] **Step 5: Commit**

```bash
git add own-it/assets/core.js own-it/scripts/lib/core.mjs tests/core.test.mjs
git commit -m "feat(own-it): shared core codec and board graders"
```

---

### Task 8: `build-missions` — recipe expansion and rung gating

**Files:**
- Create: `own-it/scripts/lib/cmd-build-missions.mjs`
- Test: `tests/build-missions.test.mjs`

**Interfaces:**
- Consumes: `check`, `RECIPE`, `loadModel`, `loadProgress`, `saveProgress`, `core.encode`, `writeJsVar`, `writeJson`, `ownItPath`, `estimate`
- Produces: `build-missions <recipe.json>` → `{session, missions: string[], est}`; writes `.own-it/mission.js` (`window.OWNIT_MISSIONS`) and `.own-it/session.json`.
  - `mission.js` shape: `{ session, mode, root, missions: [{ id, zone, rung, board, brief, lanes?, cards: {id,label,ref,conf,actor?}[], pins, tokens?: {id,label}[], blank?: true, answer: <encoded> }] }`. `root` = absolute project root with forward slashes (used for editor links).
  - `session.json`: `{ session, mode, missions: { [id]: { zone, rung, board, cardIds, refresh, threatIds } } }` (no answers).
  - Mission id: `${zone}-${rung}-${progress.seq + 1 + index}`; `progress.seq` advances by the mission count.
  - Expansion per rung:
    - `map` + `component`: `cards` required (2–12 ids of kind `surface|component|actor`); answer `{ edges }` = model edges with both ends in `cards`.
    - `trace` + `swimlanes`: `flow` required (a `flow` item). Cards = flattened steps (must be 2–12). Every card needs `actor`. `lanes` = unique actors in step order. Answer `{ steps, lanes: {cardId: actor} }`.
    - `break` + `component`: `cards` and `threats` (ids of `failure` items, 1–4, each `card` in `cards`). `tokens` = `[{id, label: item.threat}]`. Answer `{ edges, threats: [{id, card}] }`.
    - `boss` + `component`: all zone items of kind `surface|component` (max 15, first 15 by id order), `blank: true`. Answer `{ cards: [{id,label}], edges }`.
  - Gating: the rung must be `open` or `cleared` in progress, else error `rung "<rung>" is locked in zone "<zone>"`; for `trace` when `map` not cleared, append `; map needs surfaces <uncovered ids comma-joined>`. `refresh: true` missions skip gating but require the zone to be `fogged`, else error `zone "<zone>" is not fogged`.
  - Unknown ids error: `unknown ids in missions[<i>]: <ids>`. Pins whose `card` is not in the mission cards: `pin card "<id>" not in missions[<i>] cards`. Recipe schema errors: `invalid recipe: <errors joined "; ">`.
  - Any error aborts before writing anything.
  - `est = estimate(<raw recipe text>, <written mission.js text>)`; not logged here (apply logs per mission).

- [ ] **Step 1: Write failing tests `tests/build-missions.test.mjs`**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { run as init } from '../own-it/scripts/lib/cmd-init.mjs';
import { run as build } from '../own-it/scripts/lib/cmd-build-missions.mjs';
import { loadModel, saveModel } from '../own-it/scripts/lib/model.mjs';
import { loadProgress, saveProgress } from '../own-it/scripts/lib/progress.mjs';
import core from '../own-it/scripts/lib/core.mjs';
import { tmpProject, ctx } from './helpers.mjs';

const I = (o) => ({ conf: 'high', ref: 'api/t.ts:1', ...o });
async function setup() {
  const root = tmpProject({ 'api/t.ts': 'x\n' });
  writeFileSync(join(root, 'zones.json'), JSON.stringify({ zones: [{ id: 'trips', name: 'Trips', paths: ['api'] }] }));
  await init({ _: [], flags: { zones: join(root, 'zones.json') } }, ctx(root));
  const m = loadModel(root);
  m.zones.trips.items = [
    I({ id: 'c0', k: 'surface', label: 'Trip screen', actor: 'Driver app' }),
    I({ id: 'c1', k: 'surface', label: 'POST cancel', actor: 'Backend' }),
    I({ id: 'c3', k: 'surface', label: 'Approvals', actor: 'Manager portal' }),
    I({ id: 'c4', k: 'component', label: 'Trips table', actor: 'Backend' }),
    I({ id: 'e1', k: 'edge', from: 'c0', to: 'c1' }),
    I({ id: 'e2', k: 'edge', from: 'c1', to: 'c4' }),
    I({ id: 'e3', k: 'edge', from: 'c3', to: 'c1' }),
    I({ id: 'f1', k: 'flow', label: 'trip-cancel', steps: [['c0'], ['c1', 'c4'], ['c3']] }),
    I({ id: 'x1', k: 'failure', card: 'c1', threat: 'double request' }),
  ];
  saveModel(root, m);
  return root;
}
function open(root, ...rungs) {
  const p = loadProgress(root);
  for (const r of rungs) p.zones.trips.rungs[r] = 'open';
  saveProgress(root, p);
}
function recipe(root, missions, mode = 'practice') {
  const p = join(root, 'recipe.json');
  writeFileSync(p, JSON.stringify({ mode, missions }));
  return p;
}
function loadMissions(root) {
  const sandbox = { window: {} };
  vm.runInNewContext(readFileSync(join(root, '.own-it', 'mission.js'), 'utf8'), sandbox);
  return sandbox.window.OWNIT_MISSIONS;
}

test('map mission expands cards and derives edges; answer is obfuscated', async () => {
  const root = await setup();
  open(root, 'map');
  const out = await build({ _: [recipe(root, [{ zone: 'trips', rung: 'map', board: 'component', brief: 'Map it', cards: ['c0', 'c1', 'c4'] }])], flags: {} }, ctx(root));
  assert.deepEqual(out.missions, ['trips-map-1']);
  const M = loadMissions(root);
  const m = M.missions[0];
  assert.deepEqual(m.cards.map((c) => c.id), ['c0', 'c1', 'c4']);
  assert.equal(m.cards[0].ref, 'api/t.ts:1');
  assert.doesNotMatch(readFileSync(join(root, '.own-it', 'mission.js'), 'utf8'), /"edges"/);
  assert.deepEqual(core.decode(m.answer), { edges: [{ id: 'e1', from: 'c0', to: 'c1' }, { id: 'e2', from: 'c1', to: 'c4' }] });
  assert.equal(loadProgress(root).seq, 1);
  const session = JSON.parse(readFileSync(join(root, '.own-it', 'session.json'), 'utf8'));
  assert.deepEqual(session.missions['trips-map-1'].cardIds, ['c0', 'c1', 'c4']);
});

test('trace mission builds lanes and grouped steps from flow', async () => {
  const root = await setup();
  open(root, 'trace');
  await build({ _: [recipe(root, [{ zone: 'trips', rung: 'trace', board: 'swimlanes', brief: 'Cancel', flow: 'f1',
    pins: [{ card: 'c3', q: 'Why approval?' }] }])], flags: {} }, ctx(root));
  const m = loadMissions(root).missions[0];
  assert.deepEqual(m.lanes, ['Driver app', 'Backend', 'Manager portal']);
  assert.deepEqual(core.decode(m.answer), { steps: [['c0'], ['c1', 'c4'], ['c3']],
    lanes: { c0: 'Driver app', c1: 'Backend', c4: 'Backend', c3: 'Manager portal' } });
});

test('break mission adds tokens; boss mission is blank with all cards', async () => {
  const root = await setup();
  open(root, 'break', 'boss');
  await build({ _: [recipe(root, [
    { zone: 'trips', rung: 'break', board: 'component', brief: 'Break', cards: ['c0', 'c1'], threats: ['x1'] },
    { zone: 'trips', rung: 'boss', board: 'component', brief: 'Defend' }])], flags: {} }, ctx(root));
  const [b, boss] = loadMissions(root).missions;
  assert.deepEqual(b.tokens, [{ id: 'x1', label: 'double request' }]);
  assert.deepEqual(core.decode(b.answer).threats, [{ id: 'x1', card: 'c1' }]);
  assert.equal(boss.blank, true);
  assert.equal(core.decode(boss.answer).cards.length, 4);
});

test('locked rung refused with what is left to clear; nothing written', async () => {
  const root = await setup();
  await assert.rejects(build({ _: [recipe(root, [{ zone: 'trips', rung: 'trace', board: 'swimlanes', brief: 'x', flow: 'f1' }])], flags: {} }, ctx(root)),
    /rung "trace" is locked in zone "trips"; map needs surfaces c0,c1,c3/);
  assert.equal(existsSync(join(root, '.own-it', 'mission.js')), false);
});

test('unknown ids, bad pins, bad recipe rejected', async () => {
  const root = await setup();
  open(root, 'map');
  await assert.rejects(build({ _: [recipe(root, [{ zone: 'trips', rung: 'map', board: 'component', brief: 'x', cards: ['c0', 'zz'] }])], flags: {} }, ctx(root)), /unknown ids in missions\[0\]: zz/);
  await assert.rejects(build({ _: [recipe(root, [{ zone: 'trips', rung: 'map', board: 'component', brief: 'x', cards: ['c0', 'c1'], pins: [{ card: 'c3', q: 'q' }] }])], flags: {} }, ctx(root)), /pin card "c3" not in missions\[0\] cards/);
  await assert.rejects(build({ _: [recipe(root, [{ zone: 'trips', rung: 'map', board: 'pie', brief: 'x' }])], flags: {} }, ctx(root)), /invalid recipe: missions\[0\]\.board/);
});

test('refresh mission requires fogged zone', async () => {
  const root = await setup();
  await assert.rejects(build({ _: [recipe(root, [{ zone: 'trips', rung: 'map', board: 'component', brief: 'x', cards: ['c0', 'c1'], refresh: true }])], flags: {} }, ctx(root)), /zone "trips" is not fogged/);
});
```

- [ ] **Step 2: Run to verify failure** — `npm test` — FAIL.
- [ ] **Step 3: Implement `cmd-build-missions.mjs`** per the interface. Surfaces "left to clear" = zone items with `k === 'surface'` not in `progress.zones[z].surfacesCovered`, in model order.
- [ ] **Step 4: Run tests** — `npm test` — PASS.
- [ ] **Step 5: Commit**

```bash
git add own-it/scripts/lib/cmd-build-missions.mjs tests/build-missions.test.mjs
git commit -m "feat(own-it): build-missions expands recipes with rung gating"
```

---

### Task 9: `collect` — fetch answers from Downloads or clipboard string

**Files:**
- Create: `own-it/scripts/lib/cmd-collect.mjs`
- Test: `tests/collect.test.mjs`

**Interfaces:**
- Consumes: `downloadsDir`, `loadProgress`, `readJson`, `writeJson`, `check`, `ANSWER`, `ownItPath`, `core.fromBase64`
- Produces: `collect <missionId>` or `collect OWNIT:<base64>` → `{id, got, of, missed, text}` plus `wrong` only if non-empty. Saves the answer to `.own-it/answers/<id>.json`.
  - Downloads lookup: directory = `downloadsDir(progress.settings.downloadDir, ctx.env)`; files matching `^own-it-<escaped id>(?:\s*\(\d+\))?\.json$`; newest by mtime. The original file is removed after it is saved (copy then unlink, which also works across drives).
  - Mission must exist in `.own-it/session.json`, else `unknown mission "<id>" in current session`.
  - Answer `id` must equal the requested id, else `answer file is for "<other>", expected "<id>"`.
  - `submittedAt` must be ≥ `session.session`, else `answer for "<id>" is older than this session`.
  - No file: `no answer file for "<id>" in <dir>. Submit again, or set the download folder`.
  - Clipboard form: `OWNIT:` + standard base64 of UTF-8 JSON (not XOR-ed). Same validation.
  - Invalid answer: `invalid answer: <errors>`.

- [ ] **Step 1: Write failing tests `tests/collect.test.mjs`**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, existsSync, utimesSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run as collect } from '../own-it/scripts/lib/cmd-collect.mjs';
import { writeJson } from '../own-it/scripts/lib/json.mjs';
import { tmpProject, ctx } from './helpers.mjs';

function setup() {
  const root = tmpProject({});
  const dl = mkdtempSync(join(tmpdir(), 'ownit-dl-'));
  writeJson(join(root, '.own-it', 'progress.json'), { version: 1, settings: { downloadDir: null }, zones: {}, tokens: [] });
  writeJson(join(root, '.own-it', 'session.json'), { session: '2026-10-13T16:00:00.000Z', mode: 'practice',
    missions: { 'trips-map-1': { zone: 'trips', rung: 'map', board: 'component', cardIds: [] } } });
  return { root, dl, c: ctx(root, { env: { OWNIT_DOWNLOADS: dl } }) };
}
const ans = (o = {}) => ({ id: 'trips-map-1', submittedAt: '2026-10-13T16:05:00.000Z', got: 1, of: 2, missed: ['e2'], text: {}, hintsUsed: 0, challenges: [], ...o });

test('picks newest renamed file, moves it, prints compact summary without empty wrong', async () => {
  const { root, dl, c } = setup();
  writeFileSync(join(dl, 'own-it-trips-map-1.json'), JSON.stringify(ans({ got: 0 })));
  writeFileSync(join(dl, 'own-it-trips-map-1 (1).json'), JSON.stringify(ans({ got: 2, missed: [] , wrong: [] })));
  utimesSync(join(dl, 'own-it-trips-map-1.json'), new Date(1000), new Date(1000));
  const out = await collect({ _: ['trips-map-1'], flags: {} }, c);
  assert.deepEqual(out, { id: 'trips-map-1', got: 2, of: 2, missed: [], text: {} });
  assert.equal(existsSync(join(dl, 'own-it-trips-map-1 (1).json')), false);
  assert.ok(existsSync(join(root, '.own-it', 'answers', 'trips-map-1.json')));
});

test('keeps wrong when non-empty', async () => {
  const { dl, c } = setup();
  writeFileSync(join(dl, 'own-it-trips-map-1.json'), JSON.stringify(ans({ wrong: [['c', 'b']] })));
  assert.deepEqual((await collect({ _: ['trips-map-1'], flags: {} }, c)).wrong, [['c', 'b']]);
});

test('rejects answers older than the session', async () => {
  const { dl, c } = setup();
  writeFileSync(join(dl, 'own-it-trips-map-1.json'), JSON.stringify(ans({ submittedAt: '2026-10-12T10:00:00.000Z' })));
  await assert.rejects(collect({ _: ['trips-map-1'], flags: {} }, c), /older than this session/);
});

test('rejects mismatched id, unknown mission, missing file', async () => {
  const { dl, c } = setup();
  writeFileSync(join(dl, 'own-it-trips-map-1.json'), JSON.stringify(ans({ id: 'other-1' })));
  await assert.rejects(collect({ _: ['trips-map-1'], flags: {} }, c), /answer file is for "other-1", expected "trips-map-1"/);
  await assert.rejects(collect({ _: ['nope-1'], flags: {} }, c), /unknown mission "nope-1"/);
  const fresh = setup();
  await assert.rejects(collect({ _: ['trips-map-1'], flags: {} }, fresh.c), /no answer file for "trips-map-1"/);
});

test('accepts OWNIT: clipboard payload', async () => {
  const { root, c } = setup();
  const b64 = Buffer.from(JSON.stringify(ans())).toString('base64');
  const out = await collect({ _: ['OWNIT:' + b64], flags: {} }, c);
  assert.equal(out.got, 1);
  assert.ok(existsSync(join(root, '.own-it', 'answers', 'trips-map-1.json')));
});
```

- [ ] **Step 2: Run to verify failure** — `npm test` — FAIL.
- [ ] **Step 3: Implement `cmd-collect.mjs`.** Escape the id for the regex with `id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')`.
- [ ] **Step 4: Run tests** — `npm test` — PASS.
- [ ] **Step 5: Commit**

```bash
git add own-it/scripts/lib/cmd-collect.mjs tests/collect.test.mjs
git commit -m "feat(own-it): collect answers from Downloads or clipboard payload"
```

---

### Task 10: `apply` — XP, clears, claims, weak spots, badges, token log

**Files:**
- Create: `own-it/scripts/lib/cmd-apply.mjs`, `own-it/scripts/lib/scoring.mjs`
- Test: `tests/apply.test.mjs`

**Interfaces:**
- Consumes: `loadProgress`, `saveProgress`, `loadModel`, `zoneFiles`, `hashesFor`, `readJson`, `ownItPath`, `estimate`, `RUNGS`
- Produces:
  - `scoring.mjs`: `missionXp({got, text, curiosity, challengesWon, hintsUsed, mode}) → number`; `XP = { element:10, half:5, solid:20, partial:10, curiosity:5, curiosityMax:3, challenge:20, hint:-15, rung:50, claim:200, fog:30 }`; `badgesFor(progress) → string[]` (all badges earned; caller diffs).
  - `apply <missionId> [--text <json>] [--curiosity <n>] [--challenge-won <n>] [--got <n> --of <n>] [--tokens <in>,<out>]` → `{id, xp, total, ratio, cleared: string[], claimed, badges: string[], weak}`.
  - Inputs: board missions read `.own-it/answers/<id>.json` and `.own-it/session.json`. Words missions use ids matching `^<zone>-words-\d+$`, need `--got` and `--of`, no answer file, rung `words`. `--got/--of` also override for text-mode Map missions (no-browser fallback).
  - `--text` is a JSON object `{key: "solid"|"partial"|"miss"}`.
  - XP: `floor(got)*10 + (got % 1 ? 5 : 0)` + text grades + curiosity (practice only, `min(n,3)*5`) + `challengeWon*20` + `hintsUsed*-15`; clamp mission XP at ≥ 0; then add rung/claim/fog bonuses.
  - `ratio = of ? got/of : 0`, rounded to 2 decimals in output.
  - Clear rules: `words`, `trace`, `break`: `ratio ≥ 0.7`. `map`: if `ratio ≥ 0.7`, add the mission's card ids that are `surface` items to `surfacesCovered`; cleared when every zone `surface` item is covered. `boss`: `ratio ≥ 0.7` and at least 3 `solid` values in `--text` → cleared and zone claimed (+200 once).
  - On first clear of a rung: status `cleared`, +50, next rung in `RUNGS` goes from `locked` to `open`, `claimHashes[rung] = hashesFor(root, zoneFiles).hashes`.
  - Refresh mission (session mission `refresh: true`) with `ratio ≥ 0.7`: every existing `claimHashes` entry is replaced with current hashes, `fogged=false`, `fogClears++`, +30.
  - Weak spots: remove entries whose `item` was in this mission and not missed; add `{missionId, item}` for each missed id not already present.
  - `curiosity` total += practice curiosity count.
  - `finalBoss` becomes `open` when every zone is claimed.
  - Badges: `first-word` (any words cleared), `cartographer` (map cleared in every zone), `tracer` (any trace cleared), `red-team` (any break cleared), `curious-mind` (curiosity ≥ 25), `defender` (any zone claimed), `owner` (finalBoss `cleared`), `fog-lifter` (fogClears ≥ 5). Output `badges` lists only newly earned.
  - Token log entry `{t, kind:'mission', id, est}`; `est = in+out` from `--tokens` if given, else `estimate(answerFileText, JSON.stringify(sessionMission), flags.text || '')`.
  - Applying the same mission id twice errors: `mission "<id>" already applied`. Track applied ids in `progress.applied` (array).

- [ ] **Step 1: Write failing tests `tests/apply.test.mjs`**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { run as init } from '../own-it/scripts/lib/cmd-init.mjs';
import { run as apply } from '../own-it/scripts/lib/cmd-apply.mjs';
import { loadModel, saveModel } from '../own-it/scripts/lib/model.mjs';
import { loadProgress, saveProgress } from '../own-it/scripts/lib/progress.mjs';
import { writeJson, readJson } from '../own-it/scripts/lib/json.mjs';
import { tmpProject, ctx } from './helpers.mjs';

const I = (o) => ({ conf: 'high', ref: 'api/t.ts:1', ...o });
async function setup() {
  const root = tmpProject({ 'api/t.ts': 'x\n' });
  writeFileSync(join(root, 'zones.json'), JSON.stringify({ zones: [{ id: 'trips', name: 'Trips', paths: ['api'] }] }));
  await init({ _: [], flags: { zones: join(root, 'zones.json') } }, ctx(root));
  const m = loadModel(root);
  m.zones.trips.items = [I({ id: 'c0', k: 'surface', label: 'a' }), I({ id: 'c1', k: 'surface', label: 'b' }),
    I({ id: 'c2', k: 'component', label: 'c' }), I({ id: 'e1', k: 'edge', from: 'c0', to: 'c1' })];
  saveModel(root, m);
  return root;
}
function mission(root, id, meta, answer, mode = 'practice') {
  const sp = join(root, '.own-it', 'session.json');
  const s = readJson(sp, { session: '2026-10-13T16:00:00.000Z', mode, missions: {} });
  s.mode = mode;
  s.missions[id] = { refresh: false, threatIds: [], ...meta };
  writeJson(sp, s);
  if (answer) writeJson(join(root, '.own-it', 'answers', `${id}.json`), { id, submittedAt: '2026-10-13T16:05:00.000Z', text: {}, hintsUsed: 0, challenges: [], missed: [], ...answer });
}
function setRungs(root, rungs) { const p = loadProgress(root); Object.assign(p.zones.trips.rungs, rungs); saveProgress(root, p); }

test('words mission via --got/--of clears words and opens map', async () => {
  const root = await setup();
  const out = await apply({ _: ['trips-words-1'], flags: { got: '8', of: '10' } }, ctx(root));
  assert.deepEqual(out.cleared, ['words']);
  assert.equal(out.xp, 80 + 50);
  assert.deepEqual(out.badges, ['first-word']);
  const p = loadProgress(root);
  assert.equal(p.zones.trips.rungs.words, 'cleared');
  assert.equal(p.zones.trips.rungs.map, 'open');
  assert.ok(p.zones.trips.claimHashes.words['api/t.ts']);
});

test('map clears only after all surfaces covered across missions', async () => {
  const root = await setup();
  setRungs(root, { words: 'cleared', map: 'open' });
  mission(root, 'trips-map-1', { zone: 'trips', rung: 'map', board: 'component', cardIds: ['c0', 'c2'] }, { got: 1, of: 1 });
  let out = await apply({ _: ['trips-map-1'], flags: {} }, ctx(root));
  assert.deepEqual(out.cleared, []);
  mission(root, 'trips-map-2', { zone: 'trips', rung: 'map', board: 'component', cardIds: ['c1', 'c2'] }, { got: 1, of: 1 });
  out = await apply({ _: ['trips-map-2'], flags: {} }, ctx(root));
  assert.deepEqual(out.cleared, ['map']);
  assert.equal(loadProgress(root).zones.trips.rungs.trace, 'open');
});

test('XP: halves, text grades, curiosity capped, challenge, hints, clamp at zero', async () => {
  const root = await setup();
  setRungs(root, { trace: 'open' });
  mission(root, 'trips-trace-1', { zone: 'trips', rung: 'trace', board: 'swimlanes', cardIds: ['c0', 'c1'] }, { got: 2.5, of: 5, hintsUsed: 1, missed: ['c1'] });
  const out = await apply({ _: ['trips-trace-1'], flags: { text: '{"c1":"solid","c0":"partial"}', curiosity: '5', 'challenge-won': '1' } }, ctx(root));
  assert.equal(out.xp, 25 + 30 + 15 + 20 - 15);
  assert.equal(out.ratio, 0.5);
  assert.deepEqual(loadProgress(root).zones.trips.weakSpots, [{ missionId: 'trips-trace-1', item: 'c1' }]);
  mission(root, 'trips-trace-2', { zone: 'trips', rung: 'trace', board: 'swimlanes', cardIds: ['c0'] }, { got: 0, of: 5, hintsUsed: 3 });
  assert.equal((await apply({ _: ['trips-trace-2'], flags: {} }, ctx(root))).xp, 0);
});

test('exam mode ignores curiosity', async () => {
  const root = await setup();
  setRungs(root, { trace: 'open' });
  mission(root, 'trips-trace-1', { zone: 'trips', rung: 'trace', board: 'swimlanes', cardIds: ['c0'] }, { got: 1, of: 5 }, 'exam');
  assert.equal((await apply({ _: ['trips-trace-1'], flags: { curiosity: '3' } }, ctx(root))).xp, 10);
  assert.equal(loadProgress(root).curiosity, 0);
});

test('weak spot removed when later answered correctly', async () => {
  const root = await setup();
  setRungs(root, { trace: 'open' });
  mission(root, 'trips-trace-1', { zone: 'trips', rung: 'trace', board: 'swimlanes', cardIds: ['c0', 'c1'] }, { got: 1, of: 2, missed: ['c1'] });
  await apply({ _: ['trips-trace-1'], flags: {} }, ctx(root));
  mission(root, 'trips-trace-2', { zone: 'trips', rung: 'trace', board: 'swimlanes', cardIds: ['c0', 'c1'] }, { got: 2, of: 2, missed: [] });
  const out = await apply({ _: ['trips-trace-2'], flags: {} }, ctx(root));
  assert.equal(out.weak, 0);
});

test('boss needs board ratio and 3 solid answers; claim opens final boss for single zone', async () => {
  const root = await setup();
  setRungs(root, { words: 'cleared', map: 'cleared', trace: 'cleared', break: 'cleared', boss: 'open' });
  mission(root, 'trips-boss-1', { zone: 'trips', rung: 'boss', board: 'component', cardIds: ['c0', 'c1', 'c2'] }, { got: 4, of: 5 });
  let out = await apply({ _: ['trips-boss-1'], flags: { text: '{"q1":"solid","q2":"solid","q3":"partial","q4":"miss","q5":"miss"}' } }, ctx(root));
  assert.equal(out.claimed, false);
  mission(root, 'trips-boss-2', { zone: 'trips', rung: 'boss', board: 'component', cardIds: ['c0', 'c1', 'c2'] }, { got: 4, of: 5 });
  out = await apply({ _: ['trips-boss-2'], flags: { text: '{"q1":"solid","q2":"solid","q3":"solid","q4":"miss","q5":"miss"}' } }, ctx(root));
  assert.equal(out.claimed, true);
  assert.ok(out.badges.includes('defender'));
  assert.equal(loadProgress(root).finalBoss, 'open');
});

test('refresh mission clears fog and re-stamps claim hashes', async () => {
  const root = await setup();
  const p = loadProgress(root);
  Object.assign(p.zones.trips, { fogged: true, claimHashes: { map: { 'api/t.ts': 'old' } } });
  p.zones.trips.rungs.map = 'cleared';
  saveProgress(root, p);
  mission(root, 'trips-map-9', { zone: 'trips', rung: 'map', board: 'component', cardIds: ['c0'], refresh: true }, { got: 1, of: 1 });
  const out = await apply({ _: ['trips-map-9'], flags: {} }, ctx(root));
  assert.equal(out.xp, 10 + 30);
  const z = loadProgress(root).zones.trips;
  assert.equal(z.fogged, false);
  assert.notEqual(z.claimHashes.map['api/t.ts'], 'old');
});

test('token log uses --tokens when given, else estimate; double apply refused', async () => {
  const root = await setup();
  await apply({ _: ['trips-words-1'], flags: { got: '1', of: '1', tokens: '1200,300' } }, ctx(root));
  assert.deepEqual(loadProgress(root).tokens.at(-1).est, 1500);
  await assert.rejects(apply({ _: ['trips-words-1'], flags: { got: '1', of: '1' } }, ctx(root)), /mission "trips-words-1" already applied/);
});
```

- [ ] **Step 2: Run to verify failure** — `npm test` — FAIL.
- [ ] **Step 3: Implement `scoring.mjs` and `cmd-apply.mjs`.** Add `applied: []` to `defaultProgress` in `progress.mjs` (and treat missing as `[]` when loading older files).
- [ ] **Step 4: Run tests** — `npm test` — PASS (all suites).
- [ ] **Step 5: Commit**

```bash
git add own-it/scripts/lib/cmd-apply.mjs own-it/scripts/lib/scoring.mjs own-it/scripts/lib/progress.mjs tests/apply.test.mjs
git commit -m "feat(own-it): apply scoring, rung clears, claims, weak spots, badges, token log"
```

---

### Task 11: `open` command and CLI smoke test

**Files:**
- Create: `own-it/scripts/lib/cmd-open.mjs`
- Test: `tests/cli.test.mjs`

**Interfaces:**
- Produces:
  - `openCommand(platform, file) → {cmd, args}`: `win32` → `{cmd:'cmd', args:['/c','start','""', file]}`; `darwin` → `{cmd:'open', args:[file]}`; else `{cmd:'xdg-open', args:[file]}`
  - `open` → spawns detached with `stdio:'ignore'`, `unref()`, returns `{opened: '<posix path of .own-it/game.html>'}`. Error if missing: `game page missing; run init first`. With env `OWNIT_NO_OPEN=1` it does not spawn (for tests).

- [ ] **Step 1: Write failing tests `tests/cli.test.mjs`**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { openCommand } from '../own-it/scripts/lib/cmd-open.mjs';
import { SKILL_DIR } from '../own-it/scripts/lib/paths.mjs';
import { tmpProject } from './helpers.mjs';

const CLI = join(SKILL_DIR, 'scripts', 'own-it.mjs');
const run = (root, ...args) => spawnSync(process.execPath, [CLI, ...args],
  { encoding: 'utf8', env: { ...process.env, OWNIT_ROOT: root, OWNIT_NO_OPEN: '1' } });

test('openCommand per platform', () => {
  assert.deepEqual(openCommand('win32', 'C:/p/g.html'), { cmd: 'cmd', args: ['/c', 'start', '""', 'C:/p/g.html'] });
  assert.deepEqual(openCommand('darwin', '/p/g.html'), { cmd: 'open', args: ['/p/g.html'] });
  assert.deepEqual(openCommand('linux', '/p/g.html'), { cmd: 'xdg-open', args: ['/p/g.html'] });
});

test('CLI end to end: init, scan, fog, open print one JSON line each', () => {
  const root = tmpProject({ 'package.json': '{"dependencies":{"express":"4"}}', 'api/a.js': "app.get('/x', h);\n" });
  writeFileSync(join(root, 'zones.json'), JSON.stringify({ zones: [{ id: 'api', name: 'API', paths: ['api'] }] }));
  for (const args of [['init', '--zones', join(root, 'zones.json')], ['scan'], ['fog'], ['open']]) {
    const r = run(root, ...args);
    assert.equal(r.status, 0, `${args[0]}: ${r.stderr}`);
    const lines = r.stdout.trim().split('\n');
    assert.equal(lines.length, 1, args[0]);
    JSON.parse(lines[0]);
  }
});

test('CLI open before init fails cleanly', () => {
  const r = run(tmpProject({}), 'open');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /own-it: game page missing; run init first/);
});
```
This test needs `own-it/assets/game.html` to exist so `init` copies it. Create a placeholder `game.html` containing `<!doctype html><title>own-it</title>` in this task; Task 13 replaces it.

- [ ] **Step 2: Run to verify failure** — `npm test` — FAIL.
- [ ] **Step 3: Implement `cmd-open.mjs` and the placeholder `game.html`.**
- [ ] **Step 4: Run tests** — `npm test` — PASS.
- [ ] **Step 5: Commit**

```bash
git add own-it/scripts/lib/cmd-open.mjs own-it/assets/game.html tests/cli.test.mjs
git commit -m "feat(own-it): open command and CLI smoke tests"
```

---

### Task 12: Fixture project `fixtures/trip-app`

**Files:**
- Create: `fixtures/trip-app/**` (source only, no dependencies installed, no `.test.` file names)

**Requirements** (the end-to-end run in Task 16 depends on these exact concepts):
- `package.json` with dependencies `express`, `react`, `react-router-dom`.
- `server/` (Express, TypeScript-style `.ts` files):
  - `server/routes/trips.ts`: `POST /trips/:id/cancel` (driver; sets status `cancel_pending`, emits `trip.cancel_requested`), `POST /trips/:id/cancel/approve` (manager; sets `cancelled`), `POST /trips/:id/cancel/reject` (manager; back to `active`), `GET /trips/:id`.
  - `server/routes/locks.ts`: `POST /locks/:id/release-cable` (driver; only when trip `cancelled` or `completed`), `GET /locks/:id`.
  - `server/models/trip.ts`: `export enum TripStatus { REQUESTED='requested', ACTIVE='active', CANCEL_PENDING='cancel_pending', CANCELLED='cancelled', COMPLETED='completed' }`, `interface Trip`, `interface Lock { cableState: 'locked' | 'released' }` with a comment explaining "cable" is the steel cable seal on the cargo lock.
  - `server/middleware/auth.ts`: `requireRole('driver' | 'manager' | 'admin')`.
  - `server/services/notifications.ts`: `notifyManager(tripId)` called on cancel request; `notifyDriver(tripId, outcome)` on approve/reject.
  - `server/services/approvals.ts`: auto-expire of pending cancels after 24h is **missing** (a deliberate gap for Break it: pending requests never expire), and approve has **no idempotency check** (double approve sends two notifications).
- `driver-app/` (React `.tsx`): `TripScreen.tsx` with buttons "Cancel Trip" and "Release cable", `routes.tsx` with `<Route path="/trip/:id" ...>`, `api.ts` calling the endpoints.
- `manager-portal/` (React `.tsx`): `Approvals.tsx` listing `cancel_pending` trips with "Approve cancel" and "Reject" buttons, `routes.tsx` with `<Route path="/approvals" ...>`.
- `README.md`: one paragraph describing the app as a cargo-lock trip system.
- Total under 600 lines.

- [ ] **Step 1: Write the files.**
- [ ] **Step 2: Verify the scanner sees it**

Run: `node own-it/scripts/own-it.mjs scan` with `OWNIT_ROOT=fixtures/trip-app`
(PowerShell: `$env:OWNIT_ROOT='fixtures/trip-app'; node own-it/scripts/own-it.mjs scan`)
Expected: `frameworks` includes `express` and `react-router`; candidates include all 7 routes and both screens, `TripStatus` enum, and `requireRole` checks.

- [ ] **Step 3: Commit**

```bash
git add fixtures/trip-app
git commit -m "test(own-it): trip-app fixture with roles, approval lifecycle, jargon"
```

---

### Task 13: `game.html` — Map screen, component map, swimlanes, reveal, submit

**Files:**
- Modify: `own-it/assets/game.html` (replace placeholder)
- Create: `tests/fixtures/missions/mission.js`, `tests/fixtures/missions/progress.js`, `tests/fixtures/missions/README.md` (how to open the fixture page)

**Interfaces:**
- Consumes (globals, loaded by classic `<script src>` in this order): `core.js` → `OwnItCore`; `progress.js` → `window.OWNIT_PROGRESS` (optional); `mission.js` → `window.OWNIT_MISSIONS` (optional). Missing files must not break the page (show an empty state: "No missions yet. Ask Claude to start a session.").
- Produces (downloads/clipboard): answer payload from `OwnItCore.payload(...)`, downloaded as `own-it-<missionId>.json` via a Blob and `<a download>`; "Copy answer" copies `OWNIT:` + standard base64 of the UTF-8 JSON (use `OwnItCore.toBase64(new TextEncoder().encode(json))`).

**Requirements:**
- Single file, inline CSS and JS, no network requests, no external fonts. Works from `file://` in Chrome, Edge, Firefox, Safari.
- Use the `frontend-design:frontend-design` skill for the visual direction. Direction: a calm technical whiteboard (paper-grid canvas, ink-style cards, one accent color), light and dark via `prefers-color-scheme`, keyboard focus visible, 44px minimum hit targets, responsive down to 1024px width (the whiteboard is a desktop activity; below that, show a notice).
- **Map screen:** header with total XP and badge count; one card per zone showing name, 5 rung pips (cleared / open / locked), fog state, weak-spot count; token log totals (last session, per-zone extraction); session mission list with status (not started / submitted) and a "Play" button.
- **Whiteboard, common:** SVG canvas; cards are draggable (pointer events, also keyboard: arrow keys move the focused card by 16px); brief shown at top; "?" pin badge on pinned cards opens a sticky-note textarea (pin question shown above it); Submit button; Hint button disabled in exam mode and otherwise asks "Sure? Costs 15 XP" before revealing a one-line hint built from the answer (first missed edge or step) labeled "Prediction, may be wrong"; `hintsUsed` counted.
- **Component board:** drag from a card's edge handle to another card to draw a directed arrow; click an arrow then Delete/Backspace or its × to remove. Break missions show threat tokens in a tray; drag a token onto a card; each placed token gets a textarea "What happens? What defends it?" keyed `tok:<threatId>` in `text`.
- **Boss (blank):** no cards on the canvas; "Add box" creates a box with a typed label; arrows between boxes as above; "Show card list (hint, −15 XP)" reveals the palette after confirm and counts a hint. Grading uses `gradeBoss`.
- **Swimlanes board:** horizontal lanes from `lanes`; cards start in a tray; the user drags cards into lanes; order = x position left to right; lane = lane band under the card center. Grading uses `gradeSwimlanes` with placed cards sorted by x.
- **Reveal overlay** after Submit: correct arrows/cards green, missed shown as dashed red "ghost" arrows/outlines, wrong crossed out; each card shows its `ref` as a link `vscode://file/<root>/<path>:<line>` and the plain `path:line` text; score `got / of`; "Challenge" button on every missed or wrong item adds its id to `challenges` and tells the user to type "challenge <id>" in chat. After reveal, the download starts automatically and a panel shows: "Answer saved to your Downloads folder. Type **done** in chat." plus the "Copy answer" fallback button.
- Peek: on `trace` missions only, each card has a small "peek" control showing `path:line` before submit. Other rungs show refs only after reveal.
- The answer is decoded only at Submit (`OwnItCore.decode(mission.answer)`), never rendered before.
- Mission status persists only in memory for the page session; reload shows missions as not started unless answers were downloaded (no localStorage needed).

- [ ] **Step 1: Write the browser fixtures** `tests/fixtures/missions/mission.js` (generated by running `build-missions` against the trip-app fixture with one map, one trace, one break, one boss mission) and `progress.js` (two zones, mixed rung states, one fogged). README: copy `own-it/assets/game.html` and `own-it/assets/core.js` next to these two files, then open `game.html`.
- [ ] **Step 2: Build `game.html`.**
- [ ] **Step 3: Browser verification** (use the built-in browser pane on the `file://` fixture page):
  - Map screen renders both zones with correct pips, fog badge, weak counts.
  - Map mission: draw the two correct arrows plus one wrong arrow → reveal shows 2 green, 1 crossed out, score `2 / 2` (`wrong` lists one). Download fires with filename `own-it-<id>.json`.
  - Trace mission: place cards in lanes with the grouped pair swapped → full score. Move one card to a wrong lane → half credit on that card.
  - Break mission: token on wrong card → missed + wrong; textarea text appears in payload `text` under `tok:<id>`.
  - Boss: add boxes with fuzzy labels, connect → matches; hint reveal increments `hintsUsed`.
  - Exam-mode mission: Hint button disabled.
  - Page with no `mission.js`: empty state, no console errors.
  - Dark mode renders legibly.
  - Console has no errors in any flow.
- [ ] **Step 4: Commit**

```bash
git add own-it/assets/game.html tests/fixtures/missions
git commit -m "feat(own-it): game page with map, component and swimlane boards, reveal, submit"
```

---

### Task 14: `runtime.json` with real pinned Node values

**Files:**
- Create: `own-it/runtime.json`

**Requirements:**
- `minimum`: `"18.0.0"`.
- `pinned`: the latest release of the current Active LTS line, read from `https://nodejs.org/dist/index.json` (first entry with `lts` not `false`).
- For `win-x64` (`node-v<v>-x64.msi`), `darwin` (`node-v<v>.pkg`), `linux-x64` (`node-v<v>-linux-x64.tar.xz`): `url` under `https://nodejs.org/dist/v<v>/`, `sha256` from that release's `SHASUMS256.txt`, `sizeMB` from an HTTP `HEAD` request's `Content-Length` rounded to one decimal.
- No placeholder values may remain.

- [ ] **Step 1:** Fetch `index.json`, `SHASUMS256.txt`, and the three `HEAD` requests (read-only metadata; do not download installers).
- [ ] **Step 2:** Write `own-it/runtime.json`:

```json
{
  "minimum": "18.0.0",
  "pinned": "<value read in step 1>",
  "installers": {
    "win-x64":   { "url": "https://nodejs.org/dist/v<pinned>/node-v<pinned>-x64.msi", "sizeMB": <n>, "sha256": "<hex>" },
    "darwin":    { "url": "https://nodejs.org/dist/v<pinned>/node-v<pinned>.pkg", "sizeMB": <n>, "sha256": "<hex>" },
    "linux-x64": { "url": "https://nodejs.org/dist/v<pinned>/node-v<pinned>-linux-x64.tar.xz", "sizeMB": <n>, "sha256": "<hex>" }
  }
}
```
(The angle-bracket values are filled from step 1's real data; the committed file contains no angle brackets.)

- [ ] **Step 3: Verify** — `node -e "const r=require('./own-it/runtime.json'); for (const i of Object.values(r.installers)) { if(!/^[0-9a-f]{64}$/.test(i.sha256)||!(i.sizeMB>0)||!i.url.includes(r.pinned)) throw new Error(JSON.stringify(i)); } console.log('ok', r.pinned)"` — Expected: `ok v<version>`.
- [ ] **Step 4: Commit**

```bash
git add own-it/runtime.json
git commit -m "feat(own-it): pin Node LTS installers with checksums"
```

---

### Task 15: `SKILL.md` and reference docs

**Files:**
- Create: `own-it/SKILL.md`, `own-it/references/onboarding.md`, `own-it/references/extraction.md`, `own-it/references/rungs.md`, `own-it/references/grading.md`, `own-it/references/bosses.md`, `own-it/references/examples.md`
- Create: `tests/docs.test.mjs`

**Requirements:**
- Use `superpowers:writing-skills` while writing.
- `SKILL.md` frontmatter:
  ```
  ---
  name: own-it
  description: Use when user runs /own-it or asks to be quizzed on, explain, or defend code they shipped
  ---
  ```
  Body ≤ 150 words: one-line purpose; hard rules (read-only toward source; never fix bugs found while playing; never skip the fork check; every decision through the question tool with context inside the question; obey output caps; run helper commands as `node <skill-dir>/scripts/own-it.mjs <cmd>`); a phase table mapping phase → reference file: onboarding → `onboarding.md`; extraction → `extraction.md`; mission build → `rungs.md`; grading and debrief → `grading.md`; boss → `bosses.md`; data shapes → `examples.md`.
- `onboarding.md` (≤ 400 words): fork check question (three options, context inside the question; how to fork: start a new session, or use the client's fork or branch option if it has one); runtime check with the exact install question from spec 11.5 and the install rules (official URL from `runtime.json` only, checksum before running, re-check version, "Not now" → one line and stop); safety notice text; first run (`scan`, group into zones, zone confirm question, git-tracking question, `init --zones`); later runs (`fog` status); mode question; target question.
- `extraction.md` (≤ 400 words): Words pass (`scan --strings <zone>`, pick about 10 terms, web search allowed for domain meaning, label as outside knowledge); the structure-pass subagent prompt as a fenced block to paste into the Agent tool with model `sonnet`, containing the exact caps (80 lines per read, never a whole file over 150 lines, 30 reads, 80 items, one JSON line per item, `ref` and `conf` on every item, JSON only), the item kinds and fields, the `actor` field for swimlanes, `flow` steps as grouped arrays, `failure` items with `card` and `threat`; then `check-refs`, then the 2–3 random spot-checks; partial re-extraction for stale files.
- `rungs.md` (≤ 400 words): rung order and unlocks; recipe format per rung (map/component, trace/swimlanes, break/component, boss/component, refresh); Words via question tool (4 options, one correct) then `apply <zone>-words-<n> --got --of`; no-browser fallback for Words and Map; `build-missions`, `open`, then per mission: wait for "done" → `collect` → grade text → debrief → `apply`.
- `grading.md` (≤ 400 words): free-text grading scale (solid / partial / miss with one-line criteria); output caps; hint rules; curiosity rules (practice only, after answering); challenge flow (recheck the ref; if user right, fix the item via a one-item extraction file and `check-refs`, pass `--challenge-won 1`; if wrong, show evidence, no XP); Exam report card format.
- `bosses.md` (≤ 400 words): zone boss flow (blank board mission, then 5 one-line questions: why X not Y, malicious actor, data structure, where it fails, domain term; grade each; `apply` with `--text` q1..q5); final boss is not in Phase 1 (say "final boss unlocks, coming in a later version").
- `examples.md` (≈ 80 lines): one compact example each of zones file, extraction file, recipe, collect output, apply output.
- `tests/docs.test.mjs` enforces budgets and frontmatter:

```js
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
```

- [ ] **Step 1: Write `tests/docs.test.mjs`**, run `npm test`, expect FAIL (files missing).
- [ ] **Step 2: Write the docs.**
- [ ] **Step 3: Run `npm test`**, expect PASS.
- [ ] **Step 4: Commit**

```bash
git add own-it/SKILL.md own-it/references tests/docs.test.mjs
git commit -m "docs(own-it): SKILL.md and phase-scoped references within budgets"
```

---

### Task 16: End-to-end fixture run, token baseline, pressure scenarios (phase gate)

**Files:**
- Create: `docs/superpowers/reports/2026-10-13-own-it-phase1-run.md`
- Possibly modify: `own-it/references/*.md`, caps in `extraction.md` (tuning only)

- [ ] **Step 1: Install the skill locally for testing.** Copy `own-it/` to a scratch skills folder and start a fresh Claude Code session in a copy of `fixtures/trip-app` that has been `git init`-ed and committed.
- [ ] **Step 2: Play the Trips zone end to end:** Words → Map it (all surfaces) → Trace it (driver cancel flow) → Break it (pending never expires, double approve) → boss. Use the browser pane for the board. Record each CLI output line.
- [ ] **Step 3: Read the token log** (`progress.json` `tokens`) and record: extraction estimate for the zone, per-mission estimates, 5-mission session total. Compare with targets (≤ 30,000 extraction, ≤ 15,000 session). If over, tune caps in `extraction.md` or output caps in `grading.md`, re-run, record before/after.
- [ ] **Step 4: Run the 8 pressure scenarios from spec 15.2** with a subagent playing the user (one scenario per subagent prompt, skill loaded), recording pass/fail and the transcript excerpt that shows it. Fix docs for any failure, re-run that scenario.
- [ ] **Step 5: Write the report** with results, token numbers, tuning made, and any deviations. Phase gate decision: Phase 2 may start only if every check passes.
- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/reports own-it/references
git commit -m "test(own-it): phase 1 end-to-end run, token baseline, pressure scenarios"
```

---

## Self-Review Notes

- **Spec coverage:** ladder and clear rules (Tasks 8, 10), boards component + swimlanes (7, 13), answer channel download + clipboard (9, 13), self-grading + obfuscation (7, 8), question-tool rule and fork check (15, 16), scoring/modes/hints/curiosity/challenge (10, 13, 15), extraction caps, Words pass, structure pass, verification, hash cache (3, 5, 15), fog committed-only (2, 6), helper commands (1–11), runtime check (14, 15), word budgets (15), token accounting and targets (5, 10, 13, 16), fixture and pressure scenarios (12, 16). Final boss gameplay and state machine / role matrix boards are Phase 2+ by design; Task 10 opens `finalBoss` status only.
- **Deviation from spec, deliberate:** grading code lives in `assets/core.js` loaded by `game.html` via `<script src>` instead of being inlined, so the page and Node tests share one implementation. `init` copies both files. Also `progress.js` is written beside `progress.json` so the page can read progress on `file://`.
- **Type consistency:** `gradeComponent` / `gradeSwimlanes` / `gradeBreak` / `gradeBoss` / `payload` names match between Tasks 7, 8, 13. Answer file fields (`got`, `of`, `missed`, `wrong?`, `text`, `hintsUsed`, `challenges`, `submittedAt`) match between Tasks 1 (`ANSWER`), 7, 9, 10. Session file shape matches between Tasks 8, 9, 10.
