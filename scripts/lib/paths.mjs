// Path resolution. Nothing here may hardcode a user's home directory --
// the previous setup.md baked in one developer's absolute path and the
// permission check silently failed on every other machine.

import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

export const HOME = homedir();

/** ~/.claude — Claude Code's global config directory. */
export const claudeDir = () => join(HOME, '.claude');

/** ~/.claude/settings.json */
export const settingsPath = () => join(claudeDir(), 'settings.json');

/** ~/.claude/CLAUDE.md */
export const globalClaudeMd = () => join(claudeDir(), 'CLAUDE.md');

/** ~/.claude/skills/workticket — where the skill gets installed. */
export const skillInstallDir = () => join(claudeDir(), 'skills', 'workticket');

/** Credential file for a ticket provider, e.g. ~/.claude/.jira-env */
export const envFilePath = (provider) => join(claudeDir(), `.${provider}-env`);

/** Root of this package (one level up from scripts/lib). */
export const packageRoot = () =>
  resolve(fileURLToPath(new URL('../..', import.meta.url)));

/** Per-project data directory. */
export const projectDataDir = (cwd) => join(cwd, '.claude', 'workticket');

/**
 * Render an absolute path back as ~/... for display. Keeps output readable
 * and avoids leaking the user's username into logs they might paste.
 */
export function tildify(p) {
  if (!p) return p;
  const abs = resolve(p);
  return abs === HOME || abs.startsWith(HOME + '/')
    ? '~' + abs.slice(HOME.length)
    : abs;
}

/** Walk up from cwd looking for a .git directory. Returns null if none. */
export function findRepoRoot(startDir) {
  let dir = resolve(startDir);
  for (;;) {
    if (existsSync(join(dir, '.git'))) return dir;
    const parent = resolve(dir, '..');
    if (parent === dir) return null;
    dir = parent;
  }
}
