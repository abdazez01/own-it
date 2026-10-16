import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync, mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve, sep, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ownItPath } from './paths.mjs';
import { readJson, writeJson } from './json.mjs';

const MAX_BODY = 256 * 1024;
const EVENT_TYPES = ['pick', 'result', 'challenge', 'hint', 'ask'];
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
};
// Never served, even though they live under .own-it/: the token file and the inbox.
const HIDDEN = new Set(['serve.json', 'inbox']);

const send = (res, code, body, type = 'text/plain; charset=utf-8') => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(body);
};

function versions(base) {
  const out = {};
  const stat = (rel) => { try { out[rel] = statSync(join(base, rel)).mtimeMs; } catch { /* absent */ } };
  try { for (const f of readdirSync(join(base, 'data'))) if (f.endsWith('.js')) stat(`data/${f}`); } catch { /* none */ }
  for (const f of ['recs.js', 'progress.js', 'screens.js']) stat(f);
  return out;
}

function resolveStatic(base, urlPath) {
  let p;
  try { p = decodeURIComponent(urlPath); } catch { return null; }
  if (p.includes('\0') || p.includes('\\')) return null;
  const parts = p.split('/').filter(Boolean);
  if (!parts.length) parts.push('game.html');
  if (parts.some((s) => s === '..' || s === '.' || s.startsWith('.') || HIDDEN.has(s))) return null;
  const full = resolve(base, ...parts);
  if (!full.startsWith(base + sep)) return null;
  return full;
}

function readBody(req, res, cb) {
  const declared = Number(req.headers['content-length']);
  if (declared > MAX_BODY) { req.resume(); return send(res, 413, 'too large'); }
  const chunks = [];
  let size = 0, dead = false;
  req.on('data', (c) => {
    if (dead) return;
    size += c.length;
    if (size > MAX_BODY) { dead = true; chunks.length = 0; send(res, 413, 'too large'); return; }
    chunks.push(c);
  });
  req.on('end', () => { if (!dead) cb(Buffer.concat(chunks).toString('utf8')); });
}

export function startServer(ctx, { port = 0 } = {}) {
  const base = resolve(ownItPath(ctx.root));
  const token = crypto.randomBytes(16).toString('hex');
  let boundPort = 0;

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const host = req.headers.host;
    if (host !== `127.0.0.1:${boundPort}` && host !== `localhost:${boundPort}`) return send(res, 403, 'forbidden');
    const origin = req.headers.origin;
    if (origin !== undefined && origin !== `http://127.0.0.1:${boundPort}`) return send(res, 403, 'forbidden');
    const tokenOk = url.searchParams.get('t') === token;

    if (req.method === 'POST' && url.pathname === '/event') {
      if (!tokenOk) return send(res, 403, 'forbidden');
      return readBody(req, res, (text) => {
        let ev;
        try { ev = JSON.parse(text); } catch { return send(res, 400, 'invalid json'); }
        if (!ev || typeof ev !== 'object' || Array.isArray(ev) || !EVENT_TYPES.includes(ev.type)) {
          return send(res, 400, 'invalid event');
        }
        const dir = ownItPath(ctx.root, 'inbox');
        mkdirSync(dir, { recursive: true });
        let ts = Date.now();
        for (;;) {
          try { writeFileSync(join(dir, `${ts}-${ev.type}.json`), JSON.stringify(ev), { flag: 'wx' }); break; }
          catch (e) { if (e.code !== 'EEXIST') throw e; ts++; }
        }
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
    return send(res, 200, readFileSync(file), type);
  });

  return new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(port, '127.0.0.1', () => {
      boundPort = server.address().port;
      writeJson(ownItPath(ctx.root, 'serve.json'),
        { port: boundPort, pid: process.pid, token, startedAt: new Date().toISOString() });
      const close = () => new Promise((done) => {
        try { unlinkSync(ownItPath(ctx.root, 'serve.json')); } catch { /* already gone */ }
        server.close(() => done());
        server.closeAllConnections?.();
      });
      ok({ server, port: boundPort, token, close });
    });
  });
}

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
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
  const prior = existsSync(file) ? readJson(file, null) : null;
  if (prior && alive(prior.pid)) return { url: urlFor(prior), port: prior.port, pid: prior.pid };
  if (prior) unlinkSync(file);
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
