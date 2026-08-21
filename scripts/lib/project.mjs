// Per-project file mutation: the .gitignore edit.
//
// This used to live in the skill's markdown as a `sed -i ''` block. That form is
// BSD-only: on Linux, GNU sed reads the empty string as the script and fails.
// Doing it here in JS makes it portable and testable, and keeps the skill's
// instructions free of file surgery.

import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const GITIGNORE_BLOCK = {
  header: '# workticket workflow data',
  entries: ['.claude/workticket/plans/', '.claude/workticket/history/', '.claude/workticket/review/'],
};
const GRAPHIFY_BLOCK = { header: '# graphify output', entries: ['graphify-out/'] };

// config.md is deliberately NOT ignored -- the team shares one workflow config.
export const REQUIRED_IGNORES = [...GITIGNORE_BLOCK.entries, ...GRAPHIFY_BLOCK.entries];

/** Plan the .gitignore edit. Returns { missing, changed, next }. */
export function planGitignore(current) {
  const original = current ?? '';
  let text = original;

  const present = new Set(
    text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean),
  );
  const missing = REQUIRED_IGNORES.filter((e) => !present.has(e));

  if (missing.length) {
    const blocks = [];
    for (const block of [GITIGNORE_BLOCK, GRAPHIFY_BLOCK]) {
      const need = block.entries.filter((e) => missing.includes(e));
      if (!need.length) continue;
      // Reuse the block's existing header instead of printing a second one.
      const body = present.has(block.header) ? need : [block.header, ...need];
      blocks.push(body.join('\n'));
    }
    if (text && !text.endsWith('\n')) text += '\n';
    text += (text ? '\n' : '') + blocks.join('\n\n') + '\n';
  }

  return { missing, changed: text !== original, next: text };
}

export function applyGitignore(repoRoot, { dryRun = false } = {}) {
  const file = join(repoRoot, '.gitignore');
  const current = existsSync(file) ? readFileSync(file, 'utf8') : null;
  const plan = planGitignore(current);
  if (plan.changed && !dryRun) writeFileSync(file, plan.next, 'utf8');
  return { ...plan, file, created: current === null, wrote: plan.changed && !dryRun };
}

/** Count plans and history entries, for the init report. */
export function dataCounts(dataDir) {
  const count = (sub) => {
    const d = join(dataDir, sub);
    if (!existsSync(d) || !statSync(d).isDirectory()) return 0;
    return readdirSync(d).filter((f) => f.endsWith('.md') && f !== 'README.md').length;
  };
  return { plans: count('plans'), history: count('history') };
}
