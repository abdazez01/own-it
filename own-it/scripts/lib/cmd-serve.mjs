import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync, mkdirSync, writeFileSync, unlinkSync, renameSync, realpathSync, chmodSync } from 'node:fs';
import { resolve, sep, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ownItPath } from './paths.mjs';
import { readJson, writeJson } from './json.mjs';

const MAX_BODY = 256 * 1024;
// A pick may carry the chosen level; custom needs a 1..300 char description.
const PICK_LEVELS = ['easy', 'medium', 'hard', 'impossible', 'custom'];
function validLevel(ev) {
  if (ev.level === undefined) return ev.about === undefined;
  if (!PICK_LEVELS.includes(ev.level)) return false;
  if (ev.level !== 'custom') return ev.about === undefined;
  return typeof ev.about === 'string' && ev.about.trim().length >= 1 && ev.about.length <= 300;
}
const EVENT_TYPES = ['pick', 'result', 'challenge', 'hint', 'ask'];
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
};
// Only these top-level names under .own-it/ are ever served (compared lowercased).
// Everything else (serve.json, inbox/, session.json, answers/, ...) is a 404.
const SERVED = new Set(['game.html', 'core.js', 'mission.js', 'engine', 'games', 'brand', 'fonts', 'data', 'screens', 'recs.js', 'progress.js', 'screens.js', 'rounds.js', 'feedback.js']);

const send = (res, code, body, type = 'text/plain; charset=utf-8', extra = {}) => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra });
  res.end(body);
};

function tokenEquals(given, token) {
  if (typeof given !== 'string') return false;
  const a = Buffer.from(given), b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function versions(base) {
  const out = {};
  const stat = (rel) => { try { out[rel] = statSync(join(base, rel)).mtimeMs; } catch { /* absent */ } };
  try { for (const f of readdirSync(join(base, 'data'))) if (f.endsWith('.js')) stat(`data/${f}`); } catch { /* none */ }
  for (const f of ['recs.js', 'progress.js', 'screens.js', 'rounds.js', 'feedback.js']) stat(f);
  return out;
}

function resolveStatic(base, urlPath) {
  let p;
  try { p = decodeURIComponent(urlPath); } catch { return null; }
  if (p.includes('\0') || p.includes('\\')) return null;
  const parts = p.split('/').filter(Boolean);
  if (!parts.length) parts.push('game.html');
  if (parts.some((s) => s === '..' || s === '.' || s.startsWith('.'))) return null;
  if (!SERVED.has(parts[0].toLowerCase())) return null;
  const full = resolve(base, ...parts);
  if (!full.startsWith(base + sep)) return null;
  return full;
}

function readBody(req, res, cb) {
  const declared = Number(req.headers['content-length']);
  const tooLarge = () => {
    send(res, 413, 'too large', undefined, { Connection: 'close' });
    res.on('finish', () => req.destroy());
  };
  if (declared > MAX_BODY) return tooLarge();
  const chunks = [];
  let size = 0, dead = false;
  req.on('data', (c) => {
    if (dead) return;
    size += c.length;
    if (size > MAX_BODY) { dead = true; chunks.length = 0; tooLarge(); return; }
    chunks.push(c);
  });
  req.on('end', () => {
    if (dead) return;
    try { cb(Buffer.concat(chunks).toString('utf8')); }
    catch { if (!res.headersSent) send(res, 500, 'internal error'); else res.destroy(); }
  });
}

export function startServer(ctx, { port = 0 } = {}) {
  const base = resolve(ownItPath(ctx.root));
  const token = crypto.randomBytes(16).toString('hex');
  let boundPort = 0;
  const realBase = (() => { try { return realpathSync(base); } catch { return base; } })();

  const handle = (req, res) => {
    let url;
    try { url = new URL(req.url, 'http://127.0.0.1'); } catch { return send(res, 400, 'bad request'); }
    const site = req.headers['sec-fetch-site'];
    const topLevelNav = req.method === 'GET' && req.headers['sec-fetch-mode'] === 'navigate';
    if (site !== undefined && site !== 'same-origin' && site !== 'none'
      && !(topLevelNav && (site === 'cross-site' || site === 'same-site'))) return send(res, 403, 'forbidden');
    const host = req.headers.host;
    if (host !== `127.0.0.1:${boundPort}` && host !== `localhost:${boundPort}`) return send(res, 403, 'forbidden');
    const origin = req.headers.origin;
    if (origin !== undefined && origin !== `http://127.0.0.1:${boundPort}`) return send(res, 403, 'forbidden');
    const tokenOk = tokenEquals(url.searchParams.get('t'), token);

    if (req.method === 'POST' && url.pathname === '/event') {
      if (!tokenOk) return send(res, 403, 'forbidden');
      return readBody(req, res, (text) => {
        let ev;
        try { ev = JSON.parse(text); } catch { return send(res, 400, 'invalid json'); }
        if (!ev || typeof ev !== 'object' || Array.isArray(ev) || !EVENT_TYPES.includes(ev.type)) {
          return send(res, 400, 'invalid event');
        }
        if (ev.type === 'pick' && !validLevel(ev)) return send(res, 400, 'invalid level');
        const dir = ownItPath(ctx.root, 'inbox');
        mkdirSync(dir, { recursive: true });
        // Write to a tmp name, then rename: `wait` never sees a half-written event.
        const tmp = join(dir, `.${crypto.randomBytes(6).toString('hex')}.tmp`);
        writeFileSync(tmp, JSON.stringify(ev), { flag: 'wx' });
        let ts = Date.now();
        while (existsSync(join(dir, `${ts}-${ev.type}.json`))) ts++;
        try { renameSync(tmp, join(dir, `${ts}-${ev.type}.json`)); }
        catch (e) { try { unlinkSync(tmp); } catch { /* already gone */ } throw e; }
        res.writeHead(204, { 'Cache-Control': 'no-store' });
        res.end();
      });
    }
    if (req.method !== 'GET') return send(res, 404, 'not found');
    if (url.pathname === '/state') {
      if (!tokenOk) return send(res, 403, 'forbidden');
      return send(res, 200, JSON.stringify({ versions: versions(base) }), TYPES['.json']);
    }
    const file = resolveStatic(base, url.pathname);
    const type = file && TYPES[extname(file).toLowerCase()];
    if (!file || !type || !existsSync(file) || !statSync(file).isFile()) return send(res, 404, 'not found');
    // Re-check after resolving symlinks so a link inside .own-it/ cannot escape it.
    if (!realpathSync(file).startsWith(realBase + sep)) return send(res, 404, 'not found');
    return send(res, 200, readFileSync(file), type);
  };

  const server = http.createServer((req, res) => {
    try { handle(req, res); }
    catch { if (!res.headersSent) send(res, 500, 'internal error'); else res.destroy(); }
  });
  server.on('clientError', (_e, socket) => {
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
    else socket.destroy();
  });

  return new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(port, '127.0.0.1', () => {
      boundPort = server.address().port;
      const serveFile = ownItPath(ctx.root, 'serve.json');
      writeJson(serveFile, { port: boundPort, pid: process.pid, token, startedAt: new Date().toISOString() });
      try { chmodSync(serveFile, 0o600); } catch { /* not supported here */ }
      const close = () => new Promise((done) => {
        // Only remove serve.json if it is still ours.
        try { if (readJson(serveFile, null)?.token === token) unlinkSync(serveFile); } catch { /* gone or unreadable */ }
        server.close(() => done());
        server.closeAllConnections?.();
      });
      ok({ server, port: boundPort, token, close });
    });
  });
}

// True only when a live own-it server answers /state with this token on the stored port.
export async function probeInstance(s) {
  try {
    if (!s || !Number.isInteger(s.port) || typeof s.token !== 'string') return false;
    const r = await fetch(`http://127.0.0.1:${s.port}/state?t=${encodeURIComponent(s.token)}`, { signal: AbortSignal.timeout(2000) });
    if (r.status !== 200) return false;
    const body = await r.json();
    return !!body && typeof body.versions === 'object';
  } catch { return false; }
}
const urlFor = (s) => `http://127.0.0.1:${s.port}/game.html?t=${s.token}`;

export async function run(args, ctx) {
  const port = Number(args.flags.port ?? 0);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('invalid --port');
  if (args.flags.foreground) {
    const s = await startServer(ctx, { port });
    const stop = () => s.close().then(() => process.exit(0));
    process.on('SIGTERM', stop);
    process.on('SIGINT', stop);
    return { url: urlFor({ port: s.port, token: s.token }), port: s.port, pid: process.pid };
  }
  const file = ownItPath(ctx.root, 'serve.json');
  let prior = null;
  try { prior = existsSync(file) ? readJson(file, null) : null; } catch { /* corrupt: treat as stale */ }
  if (prior && await probeInstance(prior)) return { url: urlFor(prior), port: prior.port, pid: prior.pid };
  if (existsSync(file)) unlinkSync(file);
  const cli = fileURLToPath(new URL('../own-it.mjs', import.meta.url));
  const child = spawn(process.execPath, [cli, 'serve', '--foreground', '--port', String(port)], {
    cwd: ctx.root, env: { ...process.env, OWNIT_ROOT: ctx.root }, detached: true, stdio: 'ignore', windowsHide: true,
  });
  child.unref();
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 100));
    const s = existsSync(file) ? readJson(file, null) : null;
    if (s && s.pid === child.pid) return { url: urlFor(s), port: s.port, pid: s.pid };
  }
  throw new Error('server did not start');
}
