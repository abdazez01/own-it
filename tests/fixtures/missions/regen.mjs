// Regenerates mission.js and progress.js in this folder by running the real own-it CLI
// against a scratch copy of fixtures/trip-app. Usage (from repo root):
//   node tests/fixtures/missions/regen.mjs
import { cpSync, mkdtempSync, readFileSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..', '..');
const cli = join(repo, 'own-it', 'scripts', 'own-it.mjs');
const scratch = mkdtempSync(join(tmpdir(), 'own-it-fixture-'));
const posix = (p) => p.replace(/\\/g, '/');

cpSync(join(repo, 'fixtures', 'trip-app'), scratch, { recursive: true });
for (const f of ['zones.json', 'extraction-trips.json', 'recipe.json']) copyFileSync(join(here, f), join(scratch, f));
const git = (...a) => execFileSync('git', a, { cwd: scratch, stdio: 'ignore' });
git('init', '-q');
git('add', '-A');
git('-c', 'user.name=fixture', '-c', 'user.email=fixture@example.com', 'commit', '-qm', 'fixture');

const own = (...a) => console.log(execFileSync(process.execPath, [cli, ...a], { cwd: scratch, encoding: 'utf8' }).trim());
own('init', '--zones', 'zones.json');
own('check-refs', 'extraction-trips.json');

// Hand-set progress: trips has every board rung open (map cleared), access is fogged and mostly locked.
const progressPath = join(scratch, '.own-it', 'progress.json');
const p = JSON.parse(readFileSync(progressPath, 'utf8'));
p.xp = 340;
p.badges = ['first-word'];
Object.assign(p.zones.trips, {
  rungs: { words: 'cleared', map: 'cleared', trace: 'open', break: 'open', boss: 'open' },
  weakSpots: [{ missionId: 'trips-map-0', item: 'e3' }],
});
Object.assign(p.zones.access, {
  rungs: { words: 'cleared', map: 'open', trace: 'locked', break: 'locked', boss: 'locked' },
  fogged: true,
  weakSpots: [{ missionId: 'access-words-0', item: 't1' }, { missionId: 'access-words-0', item: 't2' }],
});
p.tokens.push({ t: '2026-10-12T10:00:00.000Z', kind: 'extraction', zone: 'access', est: 1800 });
p.tokens.push({ t: '2026-10-12T10:20:00.000Z', kind: 'mission', id: 'trips-map-0', est: 900 });
writeFileSync(progressPath, JSON.stringify(p, null, 1));

own('build-missions', 'recipe.json');

// Point code links at the repo copy of the app, not the deleted scratch dir.
const missionJs = readFileSync(join(scratch, '.own-it', 'mission.js'), 'utf8')
  .split(JSON.stringify(posix(scratch))).join(JSON.stringify(posix(join(repo, 'fixtures', 'trip-app'))));
writeFileSync(join(here, 'mission.js'), missionJs);
copyFileSync(join(scratch, '.own-it', 'progress.js'), join(here, 'progress.js'));
rmSync(scratch, { recursive: true, force: true });
console.log('wrote mission.js and progress.js');
