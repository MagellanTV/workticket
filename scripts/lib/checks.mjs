// Dependency checks. Each returns a uniform record so `doctor` and `install`
// can render the same dashboard:
//   { id, label, status: 'ok'|'warn'|'err'|'skip', detail, fix }
// `fix` is a string the developer can run, or null. Nothing here writes.

import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { skillInstallDir, settingsPath, tildify, claudeDir } from './paths.mjs';
import { readSettings, GLOBAL_PERMISSIONS, PROJECT_PERMISSIONS, uncoveredCommands } from './settings.mjs';
import { inspectCredentials, verifyCredentials, PROVIDERS, parseEnvFile } from './keys.mjs';
import { inspect as graphifyInspect, installCommands as GRAPHIFY_INSTALL_FN } from './graphify.mjs';
import { readFileSync } from 'node:fs';
import { envFilePath } from './paths.mjs';

const exec = promisify(execFile);
const GRAPHIFY_INSTALL = GRAPHIFY_INSTALL_FN();

const ok = (id, label, detail, fix = null) => ({ id, label, status: 'ok', detail, fix });
const warn = (id, label, detail, fix = null) => ({ id, label, status: 'warn', detail, fix });
const err = (id, label, detail, fix = null) => ({ id, label, status: 'err', detail, fix });
const skip = (id, label, detail) => ({ id, label, status: 'skip', detail, fix: null });

/** Run a command, returning {code, stdout, stderr} instead of throwing. */
async function run(cmd, args, opts = {}) {
  try {
    const { stdout, stderr } = await exec(cmd, args, { timeout: 15000, ...opts });
    return { code: 0, stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (e) {
    return { code: e.code ?? 1, stdout: (e.stdout ?? '').trim(), stderr: (e.stderr ?? '').trim() };
  }
}

async function onPath(binary) {
  // `command -v` needs a shell; spawning one per probe is fine at setup time.
  const res = await run(process.platform === 'win32' ? 'where' : 'which', [binary]);
  return res.code === 0 && res.stdout.length > 0;
}

export async function checkGit(cwd) {
  if (!(await onPath('git'))) {
    return [err('git', 'Git', 'not on PATH', 'Install git')];
  }
  const [name, email, remote] = await Promise.all([
    run('git', ['config', 'user.name'], { cwd }),
    run('git', ['config', 'user.email'], { cwd }),
    run('git', ['remote', 'get-url', 'origin'], { cwd }),
  ]);

  const out = [];
  if (name.stdout && email.stdout) {
    out.push(ok('git-identity', 'Git identity', `${name.stdout} <${email.stdout}>`));
  } else {
    const missing = [!name.stdout && 'user.name', !email.stdout && 'user.email'].filter(Boolean).join(' and ');
    out.push(
      err('git-identity', 'Git identity', `${missing} not set`, 'git config --global user.name "Your Name"'),
    );
  }

  out.push(
    remote.stdout
      ? ok('git-remote', 'Git remote', remote.stdout)
      : err('git-remote', 'Git remote', 'no origin configured', 'git remote add origin <url>'),
  );
  return out;
}

export async function checkBaseBranch(cwd, baseBranch) {
  if (!baseBranch) {
    return warn('base-branch', 'Base branch', 'not set in config', 'workticket init');
  }
  const res = await run('git', ['rev-parse', '--verify', `origin/${baseBranch}`], { cwd });
  if (res.code === 0) return ok('base-branch', 'Base branch', `origin/${baseBranch}`);

  const branches = await run('git', ['branch', '-r'], { cwd });
  const available = branches.stdout
    .split('\n')
    .map((b) => b.trim().replace(/^origin\//, ''))
    .filter((b) => b && !b.includes('->'))
    .slice(0, 8);
  return err(
    'base-branch',
    'Base branch',
    `origin/${baseBranch} not found${available.length ? ` (have: ${available.join(', ')})` : ''}`,
    'git fetch origin, or fix project.base_branch in config.md',
  );
}

export async function checkGitHubCli() {
  if (!(await onPath('gh'))) {
    return err('gh', 'GitHub CLI', 'not installed', 'brew install gh   (or see cli.github.com)');
  }
  const auth = await run('gh', ['auth', 'status']);
  // gh writes its status to stderr on some versions.
  const text = `${auth.stdout}\n${auth.stderr}`;
  if (auth.code === 0 && /Logged in to/i.test(text)) {
    const account = text.match(/account (\S+)/)?.[1] ?? 'authenticated';
    return ok('gh', 'GitHub CLI', `logged in (${account})`);
  }
  return err('gh', 'GitHub CLI', 'installed but not authenticated', 'gh auth login');
}

export async function checkTicketSystem(provider, { verify = true } = {}) {
  if (!provider) {
    return warn('tickets', 'Ticket system', 'not configured -- tickets will be pasted manually');
  }
  const spec = PROVIDERS[provider];
  if (!spec) {
    return err('tickets', 'Ticket system', `unknown provider "${provider}"`, 'Use jira or github-issues');
  }
  if (!spec.vars.length) {
    return ok('tickets', `Ticket system (${spec.label})`, 'uses gh auth -- see the GitHub CLI row');
  }

  const info = inspectCredentials(provider);
  if (!info.complete) {
    return err(
      'tickets',
      `Ticket system (${spec.label})`,
      `missing ${info.missing.join(', ')}`,
      `workticket install   (writes ${tildify(info.file)} at mode 600)`,
    );
  }
  if (info.mode && info.mode !== '600') {
    return warn(
      'tickets',
      `Ticket system (${spec.label})`,
      `credentials readable by others (mode ${info.mode})`,
      `chmod 600 ${tildify(info.file)}`,
    );
  }
  if (!verify) return ok('tickets', `Ticket system (${spec.label})`, 'credentials present (not verified)');

  // Read values only to make the API call; they are never returned or printed.
  const values = existsSync(info.file) ? parseEnvFile(readFileSync(info.file, 'utf8')) : {};
  for (const v of spec.vars) values[v] ??= process.env[v] ?? '';
  const res = await verifyCredentials(provider, values);
  return res.ok
    ? ok('tickets', `Ticket system (${spec.label})`, res.detail)
    : err(
        'tickets',
        `Ticket system (${spec.label})`,
        res.detail,
        res.status === 401 ? 'Regenerate the token and re-run workticket install' : null,
      );
}

/** A configured command is checked for its binary, not run -- running it could build. */
export async function checkCommand(id, label, command) {
  if (!command || !command.trim()) return skip(id, label, 'not configured (optional)');
  const binary = command.trim().split(/\s+/)[0];
  if (binary.startsWith('./')) {
    return existsSync(binary.slice(2))
      ? ok(id, label, command)
      : err(id, label, `${binary} not found in the project`, null);
  }
  return (await onPath(binary))
    ? ok(id, label, command)
    : err(id, label, `"${binary}" not on PATH`, `Install ${binary}, or clear it in config.md`);
}

export async function checkReviewSkill(skillName, skillPath) {
  if (!skillName) return skip('review-skill', 'Code review skill', 'not configured (optional)');
  const candidates = [skillPath, join(claudeDir(), 'skills', skillName, 'SKILL.md')].filter(Boolean);
  const found = candidates.find((p) => existsSync(p.replace(/^~/, process.env.HOME ?? '~')));
  return found
    ? ok('review-skill', 'Code review skill', `${skillName} at ${tildify(found)}`)
    : err('review-skill', 'Code review skill', `"${skillName}" not found`, 'Fix code_review.skill_path in config.md');
}

export async function checkGraphify(cwd, enabled) {
  const state = await graphifyInspect();
  const graph = existsSync(join(cwd, 'graphify-out', 'graph.json'));
  if (!enabled) {
    return skip(
      'graphify',
      'Knowledge base',
      state.installed ? `graphify ${state.version ?? ''} installed but disabled in config`.replace('  ', ' ') : 'not enabled (grep fallback)',
    );
  }
  // Optional feature: a missing graph or CLI degrades to grep, so warn not err.
  if (!state.installed) {
    return warn('graphify', 'Knowledge base', 'graphify not installed', `${GRAPHIFY_INSTALL[0]}   (or: npx workticket install)`);
  }
  if (!graph) return warn('graphify', 'Knowledge base', `graphify ${state.version ?? ''} ready, graph not built`.replace('  ', ' '), 'graphify update .');
  return ok('graphify', 'Knowledge base', `graph.json present (graphify ${state.version ?? '?'})`);
}

/** Which PR template Phase 11 will actually use. */
export function checkPrTemplate(repoRoot, config) {
  const configured = config?.pr_template?.template_path ?? '';
  if (!configured) {
    return warn('pr-template', 'PR template', 'none resolved', 'workticket init   (fetches the org default)');
  }
  if (!existsSync(join(repoRoot, configured))) {
    return err('pr-template', 'PR template', `${configured} is missing`, 'workticket init   (re-fetches it)');
  }
  const kind = configured.startsWith('.claude/workticket/') ? 'org default' : 'committed in this repo';
  return ok('pr-template', 'PR template', `${configured} (${kind})`);
}

export function checkSkillInstalled() {
  const file = join(skillInstallDir(), 'SKILL.md');
  return existsSync(file)
    ? ok('skill', 'workticket skill', tildify(skillInstallDir()))
    : err('skill', 'workticket skill', 'not installed', 'workticket install');
}

export function checkProjectClaudeMd(cwd) {
  return existsSync(join(cwd, 'CLAUDE.md'))
    ? ok('claude-md', 'CLAUDE.md', 'present')
    : warn('claude-md', 'CLAUDE.md', 'missing', 'Run /init inside Claude Code to generate it');
}

/**
 * Permissions, split by scope. The global file should carry only the read-only
 * ~/.claude grant; the broad patterns belong to the project file.
 */
export function checkPermissions(cwd) {
  const out = [];

  let global;
  try {
    global = readSettings(settingsPath()).data;
  } catch (e) {
    return [err('perms-global', 'Permissions (global)', e.message.split('\n')[0], 'Fix the JSON, then re-run')];
  }
  const gAllow = new Set(global?.permissions?.allow ?? []);
  const gDirs = new Set(global?.permissions?.additionalDirectories ?? []);
  const missingGlobal = GLOBAL_PERMISSIONS.filter((p) => !gAllow.has(p));
  const missingDir = !gDirs.has(claudeDir());
  out.push(
    !missingGlobal.length && !missingDir
      ? ok('perms-global', 'Permissions (global)', `~/.claude readable, ${gAllow.size} rule${gAllow.size === 1 ? '' : 's'} total`)
      : err(
          'perms-global',
          'Permissions (global)',
          `missing ${[...missingGlobal, missingDir ? 'additionalDirectories: ~/.claude' : null].filter(Boolean).join(', ')}`,
          'workticket install',
        ),
  );

  const projectFile = join(cwd, '.claude', 'settings.local.json');
  let project;
  try {
    project = readSettings(projectFile).data;
  } catch (e) {
    return [...out, err('perms-project', 'Permissions (project)', e.message.split('\n')[0], 'Fix the JSON, then re-run')];
  }
  const pAllow = [...(project?.permissions?.allow ?? []), ...gAllow];
  const missingProject = PROJECT_PERMISSIONS.filter((p) => !pAllow.includes(p));
  out.push(
    missingProject.length === 0
      ? ok('perms-project', 'Permissions (project)', `${PROJECT_PERMISSIONS.length} rule${PROJECT_PERMISSIONS.length === 1 ? '' : 's'} in place`)
      : err(
          'perms-project',
          'Permissions (project)',
          `${missingProject.length} missing (e.g. ${missingProject.slice(0, 3).join(', ')})`,
          'workticket init',
        ),
  );

  return { rows: out, allow: pAllow };
}

/** Project-specific binaries from config that no allow pattern covers yet. */
export function checkDynamicCommands(config, allow) {
  const commands = [
    config?.linter?.command,
    config?.linter?.fix_command,
    config?.build_test?.test_command,
    config?.build_test?.build_command,
    config?.build_test?.sideload_command,
    config?.changelog?.version_command,
  ].filter(Boolean);

  const uncovered = uncoveredCommands(commands, allow);
  if (!commands.length) return skip('perms-dynamic', 'Permissions (project commands)', 'no commands configured');
  return uncovered.length === 0
    ? ok('perms-dynamic', 'Permissions (project commands)', `${commands.length} covered`)
    : warn(
        'perms-dynamic',
        'Permissions (project commands)',
        `${uncovered.map((u) => u.pattern).join(', ')} not allowed`,
        'workticket init   (adds them to the project settings)',
      );
}

export function checkCredentialFileModes() {
  const rows = [];
  for (const provider of Object.keys(PROVIDERS)) {
    const file = envFilePath(provider);
    if (!existsSync(file)) continue;
    const mode = (statSync(file).mode & 0o777).toString(8).padStart(3, '0');
    rows.push(
      mode === '600'
        ? ok(`cred-${provider}`, `Credentials (${provider})`, `${tildify(file)} mode 600`)
        : warn(
            `cred-${provider}`,
            `Credentials (${provider})`,
            `${tildify(file)} is mode ${mode} -- readable by other users`,
            `chmod 600 ${tildify(file)}`,
          ),
    );
  }
  return rows;
}

export const counts = (rows) => ({
  ok: rows.filter((r) => r.status === 'ok').length,
  warn: rows.filter((r) => r.status === 'warn').length,
  err: rows.filter((r) => r.status === 'err').length,
  skip: rows.filter((r) => r.status === 'skip').length,
});
