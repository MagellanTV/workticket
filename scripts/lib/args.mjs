// Minimal flag parsing. Supports --flag, --flag=value, --no-flag and -h.
export function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (const arg of argv) {
    if (arg === '--') continue;
    if (arg.startsWith('--')) {
      const body = arg.slice(2);
      const eq = body.indexOf('=');
      if (eq !== -1) flags[body.slice(0, eq)] = body.slice(eq + 1);
      else if (body.startsWith('no-')) flags[body.slice(3)] = false;
      else flags[body] = true;
      continue;
    }
    if (arg.startsWith('-') && arg.length > 1) {
      for (const ch of arg.slice(1)) flags[ch] = true;
      continue;
    }
    positional.push(arg);
  }
  return { flags, positional };
}

export const HELP = `
workticket -- Claude Code ticket-to-PR workflow

Usage
  npx workticket install        Set up this machine (skill, permissions, credentials)
  npx workticket init           Set up the current project (config, .gitignore, permissions)
  npx workticket doctor         Check everything and report; writes nothing
  npx workticket help           Show this text

Options
  --dry-run       Show every change without making it. Works with install and init.
  --yes, -y       Skip confirmation prompts. Intended for CI; still respects --dry-run.
  --provider=X    Ticket provider for install: jira | github-issues | none
  --no-verify     Skip the live credential check in install and doctor.
  --quiet, -q     Only print warnings and errors.

After installing, use the skill from inside Claude Code:
  /workticket setup             Refine the generated config interactively
  /workticket TICKET-ID         Run the 12-phase workflow

Exit codes
  0  everything needed is in place
  1  something is missing or failed
  2  bad usage
`.trimStart();
