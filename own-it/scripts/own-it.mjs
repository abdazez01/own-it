#!/usr/bin/env node
import { parseArgs } from './lib/args.mjs';
import { projectRoot } from './lib/paths.mjs';

const COMMANDS = ['init', 'scan', 'check-refs', 'fog', 'build-missions', 'collect', 'apply', 'open', 'build-recs', 'serve', 'wait', 'stop'];
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
