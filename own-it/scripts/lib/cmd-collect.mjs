import { readdirSync, statSync, readFileSync, copyFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { check, ANSWER } from './validate.mjs';
import { loadProgress } from './progress.mjs';
import { readJson, writeJson } from './json.mjs';
import { downloadsDir, ownItPath } from './paths.mjs';
import core from './core.mjs';

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function parseAnswer(text) {
  let a;
  try { a = JSON.parse(text.replace(/^\uFEFF/, '')); }
  catch { throw new Error('invalid answer: not valid JSON'); }
  const errs = check(a, ANSWER);
  if (errs.length) throw new Error(`invalid answer: ${errs.join('; ')}`);
  return a;
}

// Newest valid inbox result for this mission that is not older than the session.
function inboxResult(root, id, sessionStart) {
  const dir = ownItPath(root, 'inbox');
  let names;
  try { names = readdirSync(dir).filter((n) => /^\d+-result\.json$/.test(n)); } catch { return null; }
  names.sort((a, b) => parseInt(b, 10) - parseInt(a, 10));
  for (const n of names) {
    try {
      const { type, ...answer } = JSON.parse(readFileSync(join(dir, n), 'utf8').replace(/^\uFEFF/, ''));
      if (answer.id !== id || check(answer, ANSWER).length) continue;
      if (!(Date.parse(answer.submittedAt) >= Date.parse(sessionStart))) continue;
      return answer;
    } catch { /* unreadable or invalid: try an older one */ }
  }
  return null;
}

function newestDownload(dir, id) {
  const re = new RegExp(`^own-it-${escapeRe(id)}(?:\\s*\\(\\d+\\))?\\.json$`);
  let files;
  try { files = readdirSync(dir).filter((f) => re.test(f)); } catch { files = []; }
  const found = files.map((f) => ({ path: join(dir, f), mtime: statSync(join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)[0];
  if (!found) throw new Error(`no answer file for "${id}" in ${dir}. Submit again, or set the download folder`);
  return found.path;
}

export async function run(args, ctx) {
  const arg = args._[0];
  if (!arg) throw new Error('usage: collect <missionId> | collect OWNIT:<base64>');
  const session = readJson(ownItPath(ctx.root, 'session.json'));
  const missionKnown = (id) => {
    if (!Object.hasOwn(session.missions || {}, id)) throw new Error(`unknown mission "${id}" in current session`);
  };

  let answer, source = null, wanted = arg;
  if (arg.startsWith('OWNIT:')) {
    let text;
    try { text = new TextDecoder().decode(core.fromBase64(arg.slice(6).trim())); }
    catch { throw new Error('invalid answer: clipboard payload is not valid base64'); }
    answer = parseAnswer(text);
    wanted = answer.id;
    missionKnown(wanted);
  } else {
    missionKnown(arg);
    const fromInbox = inboxResult(ctx.root, arg, session.session);
    if (fromInbox) answer = parseAnswer(JSON.stringify(fromInbox));
    else {
      const progress = loadProgress(ctx.root);
      source = newestDownload(downloadsDir(progress.settings?.downloadDir, ctx.env), arg);
      answer = parseAnswer(readFileSync(source, 'utf8'));
    }
  }

  if (answer.id !== wanted) throw new Error(`answer file is for "${answer.id}", expected "${wanted}"`);
  if (!(Date.parse(answer.submittedAt) >= Date.parse(session.session))) {
    throw new Error(`answer for "${wanted}" is older than this session`);
  }

  const dest = ownItPath(ctx.root, 'answers', `${wanted}.json`);
  if (source) {
    mkdirSync(ownItPath(ctx.root, 'answers'), { recursive: true });
    copyFileSync(source, dest);
    unlinkSync(source);
  } else {
    writeJson(dest, answer);
  }

  const out = { id: answer.id, got: answer.got, of: answer.of, missed: answer.missed, text: answer.text };
  if (Array.isArray(answer.wrong) && answer.wrong.length) out.wrong = answer.wrong;
  return out;
}
