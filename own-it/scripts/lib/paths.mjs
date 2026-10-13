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
