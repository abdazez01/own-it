import { loadProgress, saveProgress } from './progress.mjs';

export const LEVELS = ['easy', 'medium', 'hard', 'impossible'];

export async function run(args, ctx) {
  const level = args._[0];
  if (![...LEVELS, 'custom'].includes(level)) throw new Error(`usage: level <${[...LEVELS, 'custom'].join('|')}> [--about <text> --base <${LEVELS.join('|')}>]`);
  const s = {};
  if (level === 'custom') {
    const about = typeof args.flags.about === 'string' ? args.flags.about.trim() : '';
    if (!about || about.length > 300) throw new Error('--about <text> is required for custom (1 to 300 characters)');
    if (!LEVELS.includes(args.flags.base)) throw new Error(`--base <${LEVELS.join('|')}> is required for custom`);
    s.levelAbout = about;
    s.levelBase = args.flags.base;
  } else if (args.flags.about !== undefined || args.flags.base !== undefined) {
    throw new Error('--about and --base are only for custom');
  }
  const p = loadProgress(ctx.root);
  delete p.settings.levelAbout;
  delete p.settings.levelBase;
  Object.assign(p.settings, { level }, s);
  saveProgress(ctx.root, p);
  return { level, ...(level === 'custom' ? { base: s.levelBase, about: s.levelAbout } : {}) };
}
