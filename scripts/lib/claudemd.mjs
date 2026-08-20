// Registering the skill in ~/.claude/CLAUDE.md.
//
// That file is the user's own global instruction file, often with a lot in it.
// We add one clearly delimited block and never touch anything else, so the edit
// is easy to read in a diff and easy to remove by hand.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

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
