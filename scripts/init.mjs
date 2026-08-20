// `workticket init` -- project-level setup, run once per repo.
//
// Creates .claude/workticket/ with a config pre-filled from what the repo
// actually contains, migrates a legacy alfred-code directory, updates
// .gitignore, and scopes the workflow's permissions to this project.

import { existsSync, mkdirSync, cpSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  heading, info, step, good, warn, fail, skipped, planned, dim, bold,
  confirm, ask, choose, closePrompts, table, OK, WARN,
} from './lib/ui.mjs';
import {
  packageRoot, skillInstallDir, findRepoRoot, projectDataDir, tildify,
} from './lib/paths.mjs';
import { detectProject, installedSkills } from './lib/detect.mjs';
import { applyGitignore, inspectLegacy, migrateLegacy, dataCounts } from './lib/project.mjs';
import { applySettings, renderPlan, PROJECT_PERMISSIONS, uncoveredCommands, readSettings } from './lib/settings.mjs';
import { applyEdits, editsFromDetection, parseConfig, readConfig } from './lib/config.mjs';
import { claudeDir } from './lib/paths.mjs';
import * as graphify from './lib/graphify.mjs';
import { inspectCredentials } from './lib/keys.mjs';

/** Provider assumed when nothing else is specified. */
const DEFAULT_PROVIDER = 'jira';

const TEMPLATES = {
  'config.md': 'config.md',
  'plans/README.md': 'plans-README.md',
  'history/README.md': 'history-README.md',
  'review/lessons.md': 'lessons.md',
};

/** Templates ship with the package; fall back to the installed skill directory. */
function templateDir() {
  for (const base of [packageRoot(), skillInstallDir()]) {
    const dir = join(base, 'templates');
    if (existsSync(join(dir, 'config.md'))) return dir;
  }
  throw new Error(
    'Cannot find the templates directory. Run `npx workticket install` first, or run init from the package root.',
  );
}

export async function run({ flags = {} } = {}) {
  const dryRun = Boolean(flags['dry-run']);
  const assumeYes = Boolean(flags.yes || flags.y);

  const repoRoot = findRepoRoot(process.cwd());
  if (!repoRoot) {
    throw new Error('Not inside a git repository. workticket init configures a repo, so run it from one.');
  }

  heading('workticket init');
  info(`Project: ${tildify(repoRoot)}`);
  if (dryRun) warn('Dry run -- nothing will be written.');

  const dataDir = projectDataDir(repoRoot);
  const configFile = join(dataDir, 'config.md');
  const summary = [];

  // ---- 1. Legacy migration ------------------------------------------------
  const legacy = inspectLegacy(repoRoot);
  if (legacy.status === 'conflict') {
    step('Legacy directory');
    fail('Both .claude/alfred-code/ and .claude/workticket/ exist.');
    console.log('');
    info(`${bold('.claude/alfred-code/')} (${legacy.legacyFiles.length} files)`);
    legacy.legacyFiles.slice(0, 12).forEach((f) => info(dim(`  ${f}`)));
    info(`${bold('.claude/workticket/')} (${legacy.currentFiles.length} files)`);
    legacy.currentFiles.slice(0, 12).forEach((f) => info(dim(`  ${f}`)));
    console.log('');
    info('Refusing to merge two configs. Copy across whatever you want to keep,');
    info('remove .claude/alfred-code/, then run init again.');
    return 1;
  }

  if (legacy.status === 'migrate') {
    step('Migrating .claude/alfred-code/');
    const res = migrateLegacy(repoRoot, { dryRun });
    if (dryRun) {
      planned(`${res.method} .claude/alfred-code -> .claude/workticket, then rewrite stale paths`);
    } else {
      const counts = dataCounts(dataDir);
      good(`Moved with ${res.method} -- ${counts.plans} plan(s), ${counts.history} history entr(ies), lessons preserved`);
      if (res.rewrote.length) info(dim(`Rewrote paths in ${res.rewrote.length} file(s)`));
    }
    summary.push(['Migration', dryRun ? `would use ${res.method}` : `done via ${res.method}`]);
  }

  // A config that survived migration, or that a previous init wrote, belongs to
  // the developer. Record that before the template copy below creates one.
  const configPreexisted = existsSync(configFile);

  // ---- 2. Data directory --------------------------------------------------
  step('Project data directory');
  const templates = templateDir();
  const created = [];
  for (const [target, template] of Object.entries(TEMPLATES)) {
    const path = join(dataDir, target);
    if (existsSync(path)) continue;
    created.push(target);
    if (dryRun) continue;
    mkdirSync(join(path, '..'), { recursive: true });
    cpSync(join(templates, template), path);
  }
  if (!created.length) {
    skipped(`${tildify(dataDir)} already set up.`);
  } else if (dryRun) {
    planned(`create ${tildify(dataDir)} with ${created.join(', ')}`);
  } else {
    good(`Created ${created.length} file(s) in ${tildify(dataDir)}`);
  }
  summary.push(['Data directory', created.length ? `${created.length} file(s) created` : 'already present']);

  // ---- 3. Config ----------------------------------------------------------
  step('Detecting the project');
  const detected = detectProject(repoRoot);
  table(
    ['Field', 'Detected'],
    [
      ['Stack', detected.language || dim('unknown')],
      ['Linter', detected.linterCommand || dim('none found')],
      ['Tests', detected.testCommand || dim('none found')],
      ['Version source', detected.versionSource],
      ['PR template', detected.prTemplate || dim('none found')],
    ],
  );

  if (configPreexisted) {
    // Never overwrite a config the developer already has -- it may hold tuned
    // values, and after a migration it holds their whole previous setup.
    skipped(`${tildify(configFile)} already exists -- leaving it untouched.`);
    const existing = readConfig(configFile);
    const sections = existing ? Object.keys(existing).length : 0;
    if (sections < 5) {
      warn(`That config has only ${sections} recognised section(s), so it may predate the current template.`);
      info(dim(`Compare it against ${tildify(join(templates, 'config.md'))} and fill in what is missing,`));
      info(dim('or run `/workticket setup reconfigure` inside Claude Code to rebuild it.'));
    } else {
      info(dim('Apply the detected values above with `/workticket setup reconfigure`.'));
    }
    summary.push(['Config', `left as is (${sections} sections)`]);
  } else {
    const answers = await gatherAnswers({ repoRoot, detected, assumeYes, dryRun });
    const source = readFileSync(join(templates, 'config.md'), 'utf8');
    const res = applyEdits(source, editsFromDetection({ detected, ...answers }));

    // Reaching here means we are editing the template we just shipped, so a miss
    // is template drift -- a bug in this package, not something the user did.
    if (res.missed.length) {
      warn(`${res.missed.length} field(s) missing from the shipped template -- left at their defaults:`);
      res.missed.forEach((m) => info(dim(`  ${m.section} / ${m.key}`)));
    }
    if (dryRun) {
      planned(`write ${res.applied.length} detected value(s) into ${tildify(configFile)}`);
    } else {
      mkdirSync(dataDir, { recursive: true });
      writeFileSync(configFile, res.text, 'utf8');
      good(`Wrote ${res.applied.length} value(s) to ${tildify(configFile)}`);
    }
    summary.push(['Config', dryRun ? 'would write' : `${res.applied.length} value(s) written`]);
  }

  // ---- 4. .gitignore ------------------------------------------------------
  step('.gitignore');
  const gi = applyGitignore(repoRoot, { dryRun });
  if (!gi.changed) {
    skipped('Already excludes the workflow artifacts.');
  } else if (dryRun) {
    planned(
      `${gi.created ? 'create' : 'update'} .gitignore` +
        (gi.legacyLines.length ? ` (rewrite ${gi.legacyLines.length} legacy line(s))` : '') +
        (gi.missing.length ? ` and add ${gi.missing.length} entr(ies)` : ''),
    );
  } else {
    if (gi.legacyLines.length) good(`Rewrote ${gi.legacyLines.length} legacy alfred-code line(s)`);
    if (gi.missing.length) good(`Added ${gi.missing.length} entr(ies)`);
  }
  summary.push(['.gitignore', gi.changed ? (dryRun ? 'would update' : 'updated') : 'already correct']);

  // ---- 5. Knowledge graph (optional) -------------------------------------
  const wantsGraph = Boolean(readConfig(configFile)?.knowledge?.graphify_enabled);
  if (wantsGraph) {
    step('Knowledge graph');
    const state = await graphify.inspect();
    if (!state.installed) {
      warn('config enables graphify but the CLI is missing -- the analyze phase will fall back to grep.');
      info(dim(`Install it with: npx workticket install`));
    } else if (graphify.hasGraph(repoRoot)) {
      skipped('graphify-out/graph.json already built.');
    } else if (dryRun) {
      planned('graphify build');
    } else {
      // Can take minutes on a large repo, so this is opt-in rather than implied.
      const go = assumeYes ? false : await confirm('Build the graph now? (can take a few minutes)', false);
      if (!go) skipped('Skipped. Run `graphify build` when you want it.');
      else {
        step('Running graphify build');
        const res = await graphify.build(repoRoot);
        res.ok ? good('graphify-out/graph.json built') : warn(`Build failed: ${res.error ?? 'unknown error'}`);
      }
    }
  }

  // ---- 6. Project permissions --------------------------------------------
  step('Project permissions');
  const settingsFile = join(repoRoot, '.claude', 'settings.local.json');
  const config = existsSync(configFile) ? readConfig(configFile) : null;

  // Binaries this project's own commands need, on top of the standard set.
  const projectCommands = [
    config?.linter?.command,
    config?.linter?.fix_command,
    config?.build_test?.test_command,
    config?.build_test?.build_command,
    detected.linterCommand,
    detected.testCommand,
  ].filter(Boolean);
  const extra = uncoveredCommands(projectCommands, PROJECT_PERMISSIONS).map((u) => u.pattern);
  const wanted = [...PROJECT_PERMISSIONS, ...extra];

  const plan = applySettings({ file: settingsFile, permissions: wanted, dryRun: true });
  if (!plan.changed) {
    skipped(`${tildify(settingsFile)} already grants what the workflow needs.`);
    summary.push(['Project permissions', 'already present']);
  } else {
    console.log('');
    for (const line of renderPlan(settingsFile, plan)) info(line);
    if (extra.length) info(dim(`Includes ${extra.join(', ')} for this project's own commands.`));
    info(dim('These apply to this repository only. settings.local.json is personal --'));
    info(dim('gitignore it if your team does not already.'));
    console.log('');

    const go = dryRun || assumeYes || (await confirm('Add these entries?', true));
    if (!go) {
      warn('Skipped. Claude Code will keep prompting for each command and file write.');
      summary.push(['Project permissions', 'declined']);
    } else if (dryRun) {
      planned(`add ${plan.missingPermissions.length} entries to ${tildify(settingsFile)}`);
      summary.push(['Project permissions', 'would add']);
    } else {
      const res = applySettings({ file: settingsFile, permissions: wanted });
      good(`Updated ${tildify(res.file)}${res.backup ? ` (backup: ${tildify(res.backup)})` : ''}`);
      summary.push(['Project permissions', `${plan.missingPermissions.length} added`]);
    }
  }

  // ---- 6. CLAUDE.md note --------------------------------------------------
  if (!existsSync(join(repoRoot, 'CLAUDE.md'))) {
    warn('No CLAUDE.md in this repo. Run /init inside Claude Code -- the workflow reads it for project context.');
  }

  closePrompts();

  heading('Summary');
  for (const [label, value] of summary) console.log(`  ${bold(label.padEnd(22))} ${value}`);

  heading('Next');
  info(`Check everything:            ${bold('npx workticket doctor')}`);
  info(`Refine the config:           ${bold('/workticket setup reconfigure')} ${dim('(inside Claude Code)')}`);
  info(`Run the workflow:            ${bold('/workticket TICKET-ID')}`);
  if (dryRun) {
    console.log('');
    warn('This was a dry run. Re-run without --dry-run to apply.');
  }
  return 0;
}

/** The few things detection cannot decide. Falls back to safe defaults with --yes. */
async function gatherAnswers({ repoRoot, detected, assumeYes, dryRun }) {
  const graphifyReady = (await graphify.inspect()).installed;
  const defaults = {
    projectName: detected.name || basename(repoRoot),
    baseBranch: 'main',
    provider: DEFAULT_PROVIDER,
    baseUrl: credentialBaseUrl(DEFAULT_PROVIDER),
    // Enable it when the CLI is actually present; the analyze phase prefers a
    // real graph over grep, and a config flag pointing at a missing binary is
    // just a failing check.
    graphifyEnabled: graphifyReady,
  };
  if (assumeYes || dryRun || !process.stdin.isTTY) return defaults;

  console.log('');
  const projectName = await ask('Project name:', defaults.projectName);
  const baseBranch = await ask('Base branch PRs target:', await guessBaseBranch(repoRoot));

  const labels = { jira: 'Jira', 'github-issues': 'GitHub Issues', '': 'None / paste manually' };
  const picked = await choose('Ticket system:', Object.values(labels), labels[DEFAULT_PROVIDER]);
  const provider = Object.keys(labels).find((k) => labels[k] === picked) ?? DEFAULT_PROVIDER;

  let baseUrl = '';
  // Reuse the URL already in the credential file rather than asking twice. This
  // reads only the non-secret values -- inspectCredentials never returns a token.
  if (provider === 'jira') baseUrl = await ask('Jira base URL:', credentialBaseUrl('jira'));

  const skills = installedSkills(join(claudeDir(), 'skills'));
  if (skills.length) info(dim(`Installed skills you could use for review: ${skills.join(', ')}`));

  return { projectName, baseBranch, provider, baseUrl, graphifyEnabled: defaults.graphifyEnabled };
}

async function guessBaseBranch(repoRoot) {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const exec = promisify(execFile);
  for (const args of [
    ['symbolic-ref', 'refs/remotes/origin/HEAD', '--short'],
    ['branch', '--show-current'],
  ]) {
    try {
      const { stdout } = await exec('git', args, { cwd: repoRoot, timeout: 5000 });
      const value = stdout.trim().replace(/^origin\//, '');
      if (value) return value;
    } catch {
      // try the next strategy
    }
  }
  return 'main';
}

/** The base URL already configured for a provider, if any. Never a secret. */
function credentialBaseUrl(provider) {
  try {
    return inspectCredentials(provider).values?.JIRA_BASE_URL ?? '';
  } catch {
    return '';
  }
}

function basename(p) {
  return p.split(/[\\/]/).filter(Boolean).at(-1) ?? '';
}
