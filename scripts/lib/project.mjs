// Per-project file mutation: .gitignore and the alfred-code -> workticket
// migration.
//
// These operations used to live in the skill's markdown as `sed -i ''` blocks.
// That form is BSD-only: on Linux, GNU sed reads the empty string as the script
// and fails. Doing it here in JS makes it portable and testable, and keeps the
// skill's instructions free of file surgery.

import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execFileSync } from 'node:child_process';

const GITIGNORE_BLOCK = {
  header: '# workticket workflow data',
  entries: ['.claude/workticket/plans/', '.claude/workticket/history/', '.claude/workticket/review/'],
};
const GRAPHIFY_BLOCK = { header: '# graphify output', entries: ['graphify-out/'] };

// config.md is deliberately NOT ignored -- the team shares one workflow config.
export const REQUIRED_IGNORES = [...GITIGNORE_BLOCK.entries, ...GRAPHIFY_BLOCK.entries];

/**
 * Plan the .gitignore edit. Returns { missing, legacyLines, changed, next }.
 * Legacy `.claude/alfred-code/` lines are rewritten in place rather than left
 * behind as dead entries with the new ones appended after them.
 */
export function planGitignore(current) {
  const original = current ?? '';
  let text = original;

  const legacyLines = original
    .split('\n')
    .map((l, i) => ({ line: l, n: i + 1 }))
    .filter(({ line }) => line.includes('alfred-code'));

  if (legacyLines.length) {
    text = text
      .split('\n')
      .map((line) =>
        line
          .replace('.claude/alfred-code/', '.claude/workticket/')
          .replace('# alfred-code workflow data', GITIGNORE_BLOCK.header),
      )
      .join('\n');
  }

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

  return { missing, legacyLines, changed: text !== original, next: text };
}

export function applyGitignore(repoRoot, { dryRun = false } = {}) {
  const file = join(repoRoot, '.gitignore');
  const current = existsSync(file) ? readFileSync(file, 'utf8') : null;
  const plan = planGitignore(current);
  if (plan.changed && !dryRun) writeFileSync(file, plan.next, 'utf8');
  return { ...plan, file, created: current === null, wrote: plan.changed && !dryRun };
}

/** Is `path` tracked by git? Used to choose `git mv` over a plain rename. */
export function isTracked(repoRoot, path) {
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', path], {
      cwd: repoRoot,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

const walk = (dir, out = []) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (entry.isFile()) out.push(p);
  }
  return out;
};

/** Rewrite alfred-code -> workticket inside migrated files, skipping binaries. */
function rewriteReferences(dir) {
  const touched = [];
  for (const file of walk(dir)) {
    let raw;
    try {
      raw = readFileSync(file);
    } catch {
      continue;
    }
    if (raw.includes(0)) continue; // NUL byte -> treat as binary, leave alone
    const text = raw.toString('utf8');
    if (!/alfred-code/i.test(text)) continue;
    // Case matters: the old config header read "Alfred-code -- Project Configuration".
    const next = text.replace(/alfred-code/g, 'workticket').replace(/Alfred-code/g, 'Workticket');
    writeFileSync(file, next, 'utf8');
    touched.push(relative(dir, file));
  }
  return touched;
}

/**
 * Inspect the project for a legacy data directory.
 * status is one of: none | migrate | conflict | current-only
 */
export function inspectLegacy(repoRoot) {
  const current = join(repoRoot, '.claude', 'workticket');
  const legacy = join(repoRoot, '.claude', 'alfred-code');
  const hasCurrent = existsSync(current);
  const hasLegacy = existsSync(legacy);

  let status = 'none';
  if (hasLegacy && !hasCurrent) status = 'migrate';
  else if (hasLegacy && hasCurrent) status = 'conflict';
  else if (hasCurrent) status = 'current-only';

  return {
    status,
    current,
    legacy,
    legacyFiles: hasLegacy ? walk(legacy).map((f) => relative(legacy, f)).sort() : [],
    currentFiles: hasCurrent ? walk(current).map((f) => relative(current, f)).sort() : [],
  };
}

/**
 * Move .claude/alfred-code -> .claude/workticket, preferring `git mv` so file
 * history follows the rename. Never called for the conflict case: two config
 * files cannot be merged safely, so that decision belongs to the developer.
 */
export function migrateLegacy(repoRoot, { dryRun = false } = {}) {
  const info = inspectLegacy(repoRoot);
  if (info.status !== 'migrate') return { ...info, moved: false, rewrote: [], method: null };
  if (dryRun) return { ...info, moved: false, rewrote: [], method: isTracked(repoRoot, '.claude/alfred-code') ? 'git mv' : 'mv' };

  let method = 'mv';
  if (isTracked(repoRoot, '.claude/alfred-code')) {
    try {
      execFileSync('git', ['mv', '.claude/alfred-code', '.claude/workticket'], {
        cwd: repoRoot,
        stdio: 'ignore',
      });
      method = 'git mv';
    } catch {
      renameSync(info.legacy, info.current); // fall back rather than abort the migration
    }
  } else {
    mkdirSync(join(repoRoot, '.claude'), { recursive: true });
    renameSync(info.legacy, info.current);
  }

  const rewrote = rewriteReferences(info.current);
  return { ...info, moved: true, rewrote, method };
}

/** Count plans and history entries, for the migration report. */
export function dataCounts(dataDir) {
  const count = (sub) => {
    const d = join(dataDir, sub);
    if (!existsSync(d) || !statSync(d).isDirectory()) return 0;
    return readdirSync(d).filter((f) => f.endsWith('.md') && f !== 'README.md').length;
  };
  return { plans: count('plans'), history: count('history') };
}
