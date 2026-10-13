import { readFileSync, existsSync } from 'node:fs';
import { loadModel, zoneFiles } from './model.mjs';
import { loadProgress, saveProgress, defaultZoneProgress, RUNGS } from './progress.mjs';
import { hashesFor } from './hash.mjs';
import { readJson } from './json.mjs';
import { ownItPath } from './paths.mjs';
import { estimate } from './tokens.mjs';
import { XP, missionXp, badgesFor } from './scoring.mjs';

const PASS = 0.7;
const BOSS_SOLIDS = 3;
const GRADES = ['solid', 'partial', 'miss'];
const USAGE = 'usage: apply <missionId> [--text <json>] [--curiosity <n>] [--challenge-won <n>] [--got <n> --of <n>] [--tokens <in>,<out>]';

function intFlag(flags, name) {
  if (!Object.hasOwn(flags, name)) return 0;
  const v = flags[name];
  if (typeof v !== 'string' || !/^\d+$/.test(v)) throw new Error(`--${name} must be a non-negative integer`);
  return Number(v);
}

function numFlag(flags, name) {
  const v = flags[name];
  if (typeof v !== 'string' || !/^\d+(\.\d+)?$/.test(v)) throw new Error(`--${name} must be a non-negative number`);
  return Number(v);
}

function checkScore(got, of, where) {
  for (const [k, v] of [['got', got], ['of', of]]) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) throw new Error(`${where}: ${k} must be a non-negative number`);
  }
  if ((got * 2) % 1 !== 0) throw new Error(`${where}: got must be a multiple of 0.5`);
  if (got > of) throw new Error(`${where}: got (${got}) is greater than of (${of})`);
}

function parseText(flags) {
  if (!Object.hasOwn(flags, 'text')) return {};
  const raw = flags.text;
  let t;
  try { t = typeof raw === 'string' ? JSON.parse(raw) : undefined; } catch { t = undefined; }
  if (!t || typeof t !== 'object' || Array.isArray(t)) throw new Error('--text must be a JSON object');
  for (const [k, v] of Object.entries(t)) {
    if (!GRADES.includes(v)) throw new Error(`--text "${k}" must be solid, partial or miss`);
  }
  return t;
}

function parseTokens(flags) {
  if (!Object.hasOwn(flags, 'tokens')) return null;
  const v = flags.tokens;
  const m = typeof v === 'string' ? v.match(/^(\d+),(\d+)$/) : null;
  if (!m) throw new Error('--tokens must be <in>,<out> non-negative integers');
  return Number(m[1]) + Number(m[2]);
}

function parseFlags(flags) {
  const hasGot = Object.hasOwn(flags, 'got');
  const hasOf = Object.hasOwn(flags, 'of');
  if (hasGot !== hasOf) throw new Error('--got and --of must be given together');
  const score = hasGot ? { got: numFlag(flags, 'got'), of: numFlag(flags, 'of') } : null;
  if (score) checkScore(score.got, score.of, 'flags');
  return { score, text: parseText(flags), curiosity: intFlag(flags, 'curiosity'),
    challengesWon: intFlag(flags, 'challenge-won'), tokens: parseTokens(flags) };
}

// Resolve the mission: a session board mission, or a words mission (<zone>-words-<n>).
function resolveMission(root, id, model, f) {
  const sessionPath = ownItPath(root, 'session.json');
  const session = readJson(sessionPath, { mode: 'practice', missions: {} });
  const missions = session.missions || {};
  if (Object.hasOwn(missions, id)) {
    const meta = missions[id];
    if (!Object.hasOwn(model.zones, meta.zone)) throw new Error(`unknown zone "${meta.zone}" for mission "${id}"`);
    if (f.score && meta.rung !== 'map') throw new Error('--got/--of only apply to words and map missions');
    const answerPath = ownItPath(root, 'answers', `${id}.json`);
    let answer = { got: 0, of: 0, missed: [], hintsUsed: 0 };
    let answerText = '';
    if (existsSync(answerPath)) {
      answerText = readFileSync(answerPath, 'utf8');
      answer = readJson(answerPath);
      if (answer.id !== id) throw new Error(`answer file is for "${answer.id}", expected "${id}"`);
      if (!Array.isArray(answer.missed)) throw new Error(`answer for "${id}": missed must be an array`);
      if (!(Number.isInteger(answer.hintsUsed) && answer.hintsUsed >= 0)) throw new Error(`answer for "${id}": hintsUsed must be a non-negative integer`);
      checkScore(answer.got, answer.of, `answer for "${id}"`);
    } else if (!f.score) {
      throw new Error(`no answer for "${id}". Run collect first`);
    }
    const got = f.score ? f.score.got : answer.got;
    const of = f.score ? f.score.of : answer.of;
    return { zone: meta.zone, rung: meta.rung, mode: session.mode, refresh: meta.refresh === true,
      cardIds: [...(meta.cardIds || []), ...(meta.threatIds || [])], got, of,
      missed: answer.missed, hintsUsed: answer.hintsUsed, answerText, meta };
  }
  const w = id.match(/^(.+)-words-\d+$/);
  if (!w) throw new Error(`unknown mission "${id}"`);
  if (!Object.hasOwn(model.zones, w[1])) throw new Error(`unknown zone "${w[1]}" for mission "${id}"`);
  if (!f.score) throw new Error(`words mission "${id}" needs --got and --of`);
  return { zone: w[1], rung: 'words', mode: session.mode || 'practice', refresh: false, cardIds: [],
    got: f.score.got, of: f.score.of, missed: [], hintsUsed: 0, answerText: '', meta: null };
}

export async function run(args, ctx) {
  const id = args._[0];
  if (!id) throw new Error(USAGE);
  const f = parseFlags(args.flags || {});
  const model = loadModel(ctx.root);
  const progress = loadProgress(ctx.root);
  if (progress.applied.includes(id)) throw new Error(`mission "${id}" already applied`);
  const m = resolveMission(ctx.root, id, model, f);

  // All validation done; compute and write.
  const zone = model.zones[m.zone];
  const items = zone.items || [];
  if (!Object.hasOwn(progress.zones, m.zone)) progress.zones[m.zone] = defaultZoneProgress(zone.name);
  const pz = progress.zones[m.zone];
  let current;
  const hashes = () => (current ??= hashesFor(ctx.root, zoneFiles(ctx.root, zone)).hashes);

  const practice = m.mode === 'practice';
  const ratio = m.of ? m.got / m.of : 0;
  const passed = ratio >= PASS;
  let xp = missionXp({ got: m.got, text: f.text, curiosity: f.curiosity, challengesWon: f.challengesWon,
    hintsUsed: m.hintsUsed, mode: m.mode });

  const cleared = [];
  const clearRung = (rung) => {
    if (pz.rungs[rung] === 'cleared') return;
    pz.rungs[rung] = 'cleared';
    cleared.push(rung);
    xp += XP.rung;
    const next = RUNGS[RUNGS.indexOf(rung) + 1];
    if (next && pz.rungs[next] === 'locked') pz.rungs[next] = 'open';
    pz.claimHashes[rung] = { ...hashes() };
  };

  let claimed = false;
  if (m.rung === 'map') {
    if (passed) {
      const surfaces = items.filter((x) => x.k === 'surface').map((x) => x.id);
      const covered = new Set(pz.surfacesCovered);
      for (const c of m.cardIds) if (surfaces.includes(c)) covered.add(c);
      pz.surfacesCovered = [...covered];
      if (surfaces.every((s) => covered.has(s))) clearRung('map');
    }
  } else if (m.rung === 'boss') {
    const solids = Object.values(f.text).filter((v) => v === 'solid').length;
    if (passed && solids >= BOSS_SOLIDS) {
      clearRung('boss');
      if (!pz.claimed) { pz.claimed = true; claimed = true; xp += XP.claim; }
    }
  } else if (passed) {
    clearRung(m.rung);
  }

  if (m.refresh && passed) {
    for (const k of Object.keys(pz.claimHashes)) pz.claimHashes[k] = { ...hashes() };
    pz.fogged = false;
    progress.fogClears = (progress.fogClears || 0) + 1;
    xp += XP.fog;
  }

  // Weak spots: drop items answered correctly in this mission, add new misses.
  const missed = new Set(m.missed);
  const inMission = new Set([...m.cardIds, ...m.missed]);
  for (const x of items) if (x.k === 'edge' && inMission.has(x.from) && inMission.has(x.to)) inMission.add(x.id);
  pz.weakSpots = pz.weakSpots.filter((w) => !(inMission.has(w.item) && !missed.has(w.item)));
  for (const item of missed) {
    if (!pz.weakSpots.some((w) => w.item === item)) pz.weakSpots.push({ missionId: id, item });
  }

  if (practice) progress.curiosity = (progress.curiosity || 0) + f.curiosity;
  if (progress.finalBoss === 'locked' && Object.keys(model.zones).length
    && Object.keys(model.zones).every((z) => Object.hasOwn(progress.zones, z) && progress.zones[z].claimed)) {
    progress.finalBoss = 'open';
  }

  progress.xp += xp;
  const had = new Set(progress.badges);
  const badges = badgesFor(progress).filter((b) => !had.has(b));
  progress.badges.push(...badges);

  const est = f.tokens ?? estimate(m.answerText, m.meta ? JSON.stringify(m.meta) : '', typeof args.flags?.text === 'string' ? args.flags.text : '');
  progress.tokens.push({ t: ctx.now().toISOString(), kind: 'mission', id, est });
  progress.applied.push(id);
  saveProgress(ctx.root, progress);

  return { id, xp, total: progress.xp, ratio: Math.round(ratio * 100) / 100, cleared, claimed, badges,
    weak: pz.weakSpots.length };
}
