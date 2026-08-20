#!/usr/bin/env node
// CLI entry point. Routes to a command module and turns any thrown error into a
// single readable line rather than a stack trace -- the audience here is a
// developer setting up a tool, not someone debugging this package.

import { parseArgs, HELP } from '../scripts/lib/args.mjs';
import { closePrompts, fail, dim } from '../scripts/lib/ui.mjs';

const COMMANDS = {
  install: () => import('../scripts/install.mjs'),
  init: () => import('../scripts/init.mjs'),
  doctor: () => import('../scripts/doctor.mjs'),
};

const { flags, positional } = parseArgs(process.argv.slice(2));
const command = positional[0] ?? (flags.help || flags.h ? 'help' : null);

if (!command || command === 'help' || flags.help || flags.h) {
  console.log(HELP);
  process.exit(command && command !== 'help' ? 2 : 0);
}

const loader = COMMANDS[command];
if (!loader) {
  console.error(`Unknown command "${command}".\n`);
  console.error(HELP);
  process.exit(2);
}

const nodeMajor = Number(process.versions.node.split('.')[0]);
if (nodeMajor < 18) {
  console.error(`workticket needs Node 18 or newer (found ${process.versions.node}).`);
  process.exit(1);
}

try {
  const mod = await loader();
  const code = await mod.run({ flags, positional: positional.slice(1) });
  closePrompts();
  process.exit(code ?? 0);
} catch (err) {
  closePrompts();
  console.log('');
  fail(err.message || String(err));
  if (process.env.WORKTICKET_DEBUG) console.error(dim(err.stack ?? ''));
  else console.log(dim('  Set WORKTICKET_DEBUG=1 for the full stack trace.'));
  process.exit(1);
}
