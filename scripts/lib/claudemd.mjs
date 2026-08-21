// Registering the skill in ~/.claude/CLAUDE.md.
//
// That file is the user's own global instruction file, often with a lot in it.
// We add one clearly delimited block and never touch anything else, so the edit
// is easy to read in a diff and easy to remove by hand.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const BLOCK_START = '<!-- workticket:start -->';
export const BLOCK_END = '<!-- workticket:end -->';

export function renderBlock() {
  return [
    BLOCK_START,
    '# workticket',
    '- **workticket** (`~/.claude/skills/workticket/SKILL.md`) - ticket to PR workflow. Trigger: `/workticket`',
    'When the user types `/workticket`, use the installed workticket skill before doing anything else.',
    BLOCK_END,
  ].join('\n');
}

/**
 * Plan the edit. Returns { action: 'create'|'append'|'replace'|'none', next }.
 * An existing block is replaced wholesale so an upgrade refreshes the wording
 * instead of stacking a second registration.
 */
export function planRegistration(current) {
  const block = renderBlock();
  if (current === null || current === undefined) {
    return { action: 'create', next: block + '\n' };
  }

  const start = current.indexOf(BLOCK_START);
  const end = current.indexOf(BLOCK_END);
  if (start !== -1 && end !== -1 && end > start) {
    const existing = current.slice(start, end + BLOCK_END.length);
    if (existing === block) return { action: 'none', next: current };
    return {
      action: 'replace',
      next: current.slice(0, start) + block + current.slice(end + BLOCK_END.length),
    };
  }

  // An unmanaged mention from a hand-written setup: leave it alone and add the
  // managed block, rather than trying to rewrite prose the user wrote.
  const separator = current.endsWith('\n\n') ? '' : current.endsWith('\n') ? '\n' : '\n\n';
  return { action: 'append', next: current + separator + block + '\n', hadLooseMention: /workticket/i.test(current) };
}

export function applyRegistration(file, { dryRun = false } = {}) {
  const current = existsSync(file) ? readFileSync(file, 'utf8') : null;
  const plan = planRegistration(current);
  if (plan.action !== 'none' && !dryRun) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, plan.next, 'utf8');
  }
  return { ...plan, file, wrote: plan.action !== 'none' && !dryRun };
}

/**
 * A starting CLAUDE.md built from what detection already established.
 *
 * This is deliberately a scaffold, not a substitute for `/init`. Writing a real
 * CLAUDE.md means reading the codebase and describing its architecture and
 * conventions -- an LLM's job. What a script can contribute is the handful of
 * facts it actually verified: the stack it identified from the build files, the
 * commands it confirmed, the branch PRs target. Everything else is left as an
 * explicit gap rather than filled with plausible guesses, because a confidently
 * wrong CLAUDE.md is worse than a short one -- every later phase reads it as
 * ground truth.
 */
export function renderProjectScaffold({ projectName, detected, baseBranch, prTemplate }) {
  const lines = [`# ${projectName || 'Project'}`, ''];

  lines.push('> Scaffold written by `workticket init` from the build files it found.');
  lines.push('> Run `/init` in Claude Code to replace it with a real analysis of the codebase,');
  lines.push('> or edit it by hand. The sections marked TODO are the ones a script cannot fill in.');
  lines.push('');

  lines.push('## Stack', '');
  lines.push(detected.language ? `- ${detected.language}` : '- TODO: not detected from the build files');
  lines.push('');

  lines.push('## Commands', '');
  const commands = [
    ['Build', detected.buildCommand],
    ['Test', detected.testCommand],
    ['Lint', detected.linterCommand],
    ['Lint (fix)', detected.linterFixCommand],
  ].filter(([, cmd]) => cmd);
  if (commands.length) {
    for (const [label, cmd] of commands) lines.push(`- ${label}: \`${cmd}\``);
  } else {
    lines.push('- TODO: no build or test command detected');
  }
  lines.push('');

  lines.push('## Conventions', '');
  lines.push('TODO: describe the patterns a change should follow — layering, naming, error');
  lines.push('handling, testing style. Phases 05 and 06 read this to decide which existing');
  lines.push('patterns to imitate, so leaving it empty means they infer from whatever file they');
  lines.push('happen to open first.');
  lines.push('');

  lines.push('## Architecture', '');
  lines.push('TODO: the main modules and how they relate.');
  lines.push('');

  lines.push('## Pull requests', '');
  lines.push(`- Base branch: \`${baseBranch || 'TODO'}\``);
  if (prTemplate) lines.push(`- Template: \`${prTemplate}\``);
  lines.push('');

  return lines.join('\n');
}

/**
 * Write the scaffold only when there is no CLAUDE.md. Never overwrites: an
 * existing one is the developer's, and a generated stub replacing a real
 * analysis would be a straight downgrade.
 */
export function writeProjectScaffold(repoRoot, data, { dryRun = false } = {}) {
  const file = join(repoRoot, 'CLAUDE.md');
  if (existsSync(file)) return { file, wrote: false, reason: 'already exists' };
  const content = renderProjectScaffold(data);
  if (!dryRun) writeFileSync(file, content, 'utf8');
  return { file, wrote: !dryRun, reason: dryRun ? 'dry run' : 'created', content };
}
