import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { ownItPath, toPosix } from './paths.mjs';

export function openCommand(platform, file) {
  if (platform === 'win32') return { cmd: 'cmd', args: ['/c', 'start', '""', file] };
  if (platform === 'darwin') return { cmd: 'open', args: [file] };
  return { cmd: 'xdg-open', args: [file] };
}

// Only loopback http URLs with an explicit port: the serve origin and nothing else.
export function isLocalUrl(u) {
  if (typeof u !== "string" || !/^[A-Za-z0-9:/._?=%-]+$/.test(u)) return false; // no shell metacharacters
  try {
    const x = new URL(u);
    return x.protocol === "http:" && (x.hostname === "127.0.0.1" || x.hostname === "localhost") && x.port !== "" && !x.username && !x.password;
  } catch { return false; }
}

export async function run(args, ctx) {
  const url = args._[0];
  if (url !== undefined && !isLocalUrl(url)) throw new Error("open takes only an http://127.0.0.1:<port> or http://localhost:<port> URL");
  const file = url !== undefined ? url : ownItPath(ctx.root, "game.html");
  if (url === undefined && !existsSync(file)) throw new Error("game page missing; run init first");
  if (!ctx.env.OWNIT_NO_OPEN) {
    const { cmd, args } = openCommand(process.platform, file);
    // On Windows pass the command line verbatim so `start "" "<path>"` keeps its quoting.
    const win = process.platform === 'win32';
    const finalArgs = win ? args.slice(0, -1).concat(`"${file}"`) : args;
    const child = spawn(cmd, finalArgs, { detached: true, stdio: 'ignore', windowsVerbatimArguments: win, windowsHide: true });
    child.on('error', (e) => process.stderr.write(`own-it: could not open browser (${e.message}); open ${toPosix(file)} manually\n`));
    child.unref();
  }
  return { opened: url !== undefined ? url : toPosix(file) };
}
