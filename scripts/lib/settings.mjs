// Reading and merging Claude Code settings files.
//
// Consent model, deliberately conservative because these are files the user owns
// and did not create for us:
//   - the caller must show renderPlan() output and get a yes before applying
//   - the file is backed up before the first write
//   - entries are only ever appended; nothing existing is removed or reordered
//   - a malformed file aborts the merge instead of being overwritten
//
// Scope split. The broad patterns (Bash, Edit, Write) go in the *project's*
// .claude/settings.local.json, so they apply only inside the repo where the
// workflow runs. Only the two entries that are inherently machine-wide go in
// ~/.claude/settings.json: the skill has to read its own config and the
// credential files, and those live outside any repo.

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { claudeDir, settingsPath, tildify } from './paths.mjs';

/**
 * Machine-wide, written to ~/.claude/settings.json.
 * Read-only and confined to ~/.claude -- nothing here grants write access or
 * reaches into the user's other projects.
 */
export const GLOBAL_PERMISSIONS = ['Read(~/.claude/**)'];

/** ~/.claude must be reachable for the skill to read config.md and .{provider}-env. */
export const GLOBAL_DIRECTORIES = [claudeDir()];

/**
 * Per-project, written to .claude/settings.local.json. Inside a project
 * settings file these patterns apply to that project only.
 */
export const PROJECT_PERMISSIONS = [
  // version control and PR creation
  'Bash(git:*)',
  'Bash(gh:*)',
  // search and inspection used by the analyze and validate phases
  'Bash(grep:*)',
  'Bash(find:*)',
  'Bash(ls:*)',
  'Bash(cat:*)',
  'Bash(head:*)',
  'Bash(tail:*)',
  'Bash(wc:*)',
  'Bash(sort:*)',
  'Bash(echo:*)',
  'Bash(sed:*)',
  'Bash(awk:*)',
  // preflight probes
  'Bash(test -d:*)',
  'Bash(test -f:*)',
  'Bash(command -v:*)',
  // plumbing for plans, history and lessons
  'Bash(mkdir -p:*)',
  'Bash(cp:*)',
  'Bash(mv:*)',
  // credential sourcing and ticket-system calls
  'Bash(source:*)',
  'Bash(curl:*)',
  // file tools -- without these, every edit in Phase 07 prompts
  'Read(**)',
  'Edit(**)',
  'Write(**)',
];

/** Read and parse a settings file. Returns { data, existed }. */
export function readSettings(file) {
  if (!existsSync(file)) return { data: {}, existed: false };
  const raw = readFileSync(file, 'utf8');
  if (raw.trim() === '') return { data: {}, existed: true };

  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `${tildify(file)} is not valid JSON (${err.message}).\n` +
        '    Fix or move that file, then re-run. Refusing to overwrite settings that cannot be parsed.',
    );
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`${tildify(file)} does not contain a JSON object. Refusing to overwrite it.`);
  }
  return { data, existed: true };
}

/**
 * Work out what a merge would add, without touching disk.
 * Returns { missingPermissions, missingDirectories, changed, next }.
 */
export function planMerge(settings, { permissions = [], directories = [] } = {}) {
  // structuredClone leaves unrelated top-level keys (theme, hooks, ...) intact.
  const next = structuredClone(settings);
  next.permissions ??= {};
  const perms = next.permissions;

  const existingAllow = Array.isArray(perms.allow) ? perms.allow : [];
  const allowSet = new Set(existingAllow);
  const missingPermissions = permissions.filter((p) => !allowSet.has(p));

  const existingDirs = Array.isArray(perms.additionalDirectories) ? perms.additionalDirectories : [];
  const dirSet = new Set(existingDirs);
  const missingDirectories = directories.filter((d) => !dirSet.has(d));

  // Append only. Existing entries keep their position, so the user reading a
  // diff sees additions at the end rather than a reshuffled file.
  perms.allow = [...existingAllow, ...missingPermissions];
  if (existingDirs.length || missingDirectories.length) {
    perms.additionalDirectories = [...existingDirs, ...missingDirectories];
  }

  return {
    missingPermissions,
    missingDirectories,
    changed: missingPermissions.length > 0 || missingDirectories.length > 0,
    next,
  };
}

/** Human-readable summary of a plan, for showing before asking to apply. */
export function renderPlan(file, plan) {
  const lines = [];
  if (!plan.changed) {
    lines.push(`${tildify(file)} already has everything needed -- nothing to add.`);
    return lines;
  }
  lines.push(`${tildify(file)} would gain ${plan.missingPermissions.length + plan.missingDirectories.length} entr${
    plan.missingPermissions.length + plan.missingDirectories.length === 1 ? 'y' : 'ies'
  }:`);
  for (const p of plan.missingPermissions) lines.push(`  + permissions.allow: ${p}`);
  for (const d of plan.missingDirectories) lines.push(`  + permissions.additionalDirectories: ${tildify(d)}`);
  lines.push('Nothing already in the file is removed, reordered, or rewritten.');
  return lines;
}

/** Copy the file next to itself before the first write. Returns the backup path. */
export function backupSettings(file, now = new Date()) {
  if (!existsSync(file)) return null;
  const stamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backup = `${file}.backup-${stamp}`;
  copyFileSync(file, backup);
  return backup;
}

/**
 * Apply a merge. The caller is responsible for having obtained consent; pass
 * dryRun to compute the plan and touch nothing.
 */
export function applySettings({ file, permissions = [], directories = [], dryRun = false } = {}) {
  const { data, existed } = readSettings(file);
  const plan = planMerge(data, { permissions, directories });

  if (!plan.changed || dryRun) {
    return { ...plan, file, existed, wrote: false, backup: null };
  }

  const backup = backupSettings(file);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(plan.next, null, 2) + '\n', 'utf8');
  return { ...plan, file, existed, wrote: true, backup };
}

/** Convenience wrapper for the machine-wide file. */
export const planGlobal = (dryRun = false) =>
  applySettings({
    file: settingsPath(),
    permissions: GLOBAL_PERMISSIONS,
    directories: GLOBAL_DIRECTORIES,
    dryRun,
  });

/**
 * Which of `commands` reference a binary no allow pattern covers.
 * `npm run lint` needs Bash(npm:*); `./gradlew test` needs Bash(./gradlew:*).
 * Returned so init can offer to add the project-specific ones it detected.
 */
export function uncoveredCommands(commands, allow) {
  const allowSet = new Set(allow ?? []);
  const seen = new Set();
  const out = [];
  for (const cmd of commands) {
    if (!cmd || !cmd.trim()) continue;
    const binary = cmd.trim().split(/\s+/)[0];
    const pattern = `Bash(${binary}:*)`;
    if (allowSet.has(pattern) || seen.has(pattern)) continue;
    seen.add(pattern);
    out.push({ command: cmd, binary, pattern });
  }
  return out;
}
