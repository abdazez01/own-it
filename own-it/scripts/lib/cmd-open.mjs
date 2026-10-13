import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { ownItPath, toPosix } from './paths.mjs';

export function openCommand(platform, file) {
  if (platform === 'win32') return { cmd: 'cmd', args: ['/c', 'start', '""', file] };
  if (platform === 'darwin') return { cmd: 'open', args: [file] };
  return { cmd: 'xdg-open', args: [file] };
}

export async function run(_args, ctx) {
  const file = ownItPath(ctx.root, 'game.html');
  if (!existsSync(file)) throw new Error('game page missing; run init first');
  if (!ctx.env.OWNIT_NO_OPEN) {
    const { cmd, args } = openCommand(process.platform, file);
    // On Windows pass the command line verbatim so `start "" "<path>"` keeps its quoting.
    const win = process.platform === 'win32';
    const finalArgs = win ? args.slice(0, -1).concat(`"${file}"`) : args;
    const child = spawn(cmd, finalArgs, { detached: true, stdio: 'ignore', windowsVerbatimArguments: win, windowsHide: true });
    child.on('error', (e) => process.stderr.write(`own-it: could not open browser (${e.message}); open ${toPosix(file)} manually
`));
    child.unref();
  }
  return { opened: toPosix(file) };
}
