// `workticket install` -- machine-level setup, run once per machine.
//
// Installs the skill files, registers the skill in ~/.claude/CLAUDE.md, adds the
// read-only ~/.claude grant to global settings, and collects ticket-system
// credentials. Everything that is repo-specific belongs to `init` instead.

import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  heading, info, step, good, warn, fail, skipped, planned, dim, bold,
  confirm, choose, ask, askSecret, closePrompts,
} from './lib/ui.mjs';
import { packageRoot, skillInstallDir, globalClaudeMd, settingsPath, claudeDir, tildify } from './lib/paths.mjs';
import { applySettings, renderPlan, GLOBAL_PERMISSIONS, GLOBAL_DIRECTORIES } from './lib/settings.mjs';
import { applyRegistration } from './lib/claudemd.mjs';
import { PROVIDERS, inspectCredentials, writeCredentials, verifyCredentials, claudeDirMode } from './lib/keys.mjs';
import { checkGitHubCli } from './lib/checks.mjs';
import * as graphify from './lib/graphify.mjs';

// What actually makes up the skill. The installer's own bin/ and scripts/ stay
// in the npm package; the skill directory holds only what Claude Code reads.
const SKILL_CONTENT = ['SKILL.md', 'README.md', 'setup', 'phases', 'agents', 'integrations', 'templates'];

/** Provider assumed when nothing else is specified. See resolveProvider(). */
const DEFAULT_PROVIDER = 'jira';

export async function run({ flags = {} } = {}) {
  const dryRun = Boolean(flags['dry-run']);
  const assumeYes = Boolean(flags.yes || flags.y);
  const verify = flags.verify !== false;

  heading('workticket install');
  info(`Target: ${tildify(claudeDir())}`);
  if (dryRun) warn('Dry run -- nothing will be written.');

  const summary = [];

  // ---- 1. Skill files -----------------------------------------------------
  step('Installing skill files');
  const source = packageRoot();
  const dest = skillInstallDir();

  if (resolve(source) === resolve(dest)) {
    skipped(`Already running from ${tildify(dest)} -- nothing to copy.`);
    summary.push(['Skill files', 'already in place']);
  } else {
    const missing = SKILL_CONTENT.filter((p) => !existsSync(join(source, p)));
    if (missing.length) {
      throw new Error(`Package looks incomplete -- missing: ${missing.join(', ')}`);
    }
    if (dryRun) {
      planned(`copy ${SKILL_CONTENT.length} entries into ${tildify(dest)}`);
    } else {
      mkdirSync(dest, { recursive: true });
      for (const entry of SKILL_CONTENT) {
        cpSync(join(source, entry), join(dest, entry), { recursive: true, force: true });
      }
      good(`Installed into ${tildify(dest)}`);
    }
    summary.push(['Skill files', tildify(dest)]);
  }

  // ---- 2. CLAUDE.md registration -----------------------------------------
  step('Registering the skill');
  const reg = applyRegistration(globalClaudeMd(), { dryRun });
  if (reg.action === 'none') {
    skipped(`${tildify(reg.file)} already registers workticket.`);
  } else if (dryRun) {
    planned(`${reg.action} the workticket block in ${tildify(reg.file)}`);
  } else {
    good(`${reg.action === 'create' ? 'Created' : 'Updated'} ${tildify(reg.file)}`);
    if (reg.hadLooseMention) {
      warn('That file already mentioned workticket outside our block -- left as is, check for a duplicate.');
    }
  }
  summary.push(['Registration', reg.action === 'none' ? 'already present' : reg.action]);

  // ---- 3. Global permissions ---------------------------------------------
  step('Global permissions');
  const plan = applySettings({
    file: settingsPath(),
    permissions: GLOBAL_PERMISSIONS,
    directories: GLOBAL_DIRECTORIES,
    dryRun: true,
  });

  if (!plan.changed) {
    skipped(`${tildify(settingsPath())} already grants what the skill needs.`);
    summary.push(['Global permissions', 'already present']);
  } else {
    console.log('');
    for (const line of renderPlan(settingsPath(), plan)) info(line);
    info(dim('This grant is read-only and confined to ~/.claude. The broader'));
    info(dim('Bash/Edit/Write rules are scoped per project by `workticket init`.'));
    console.log('');

    const go = dryRun || assumeYes || (await confirm('Add these entries?', true));
    if (!go) {
      warn('Skipped. The skill will prompt for permission when it reads its own config.');
      summary.push(['Global permissions', 'declined']);
    } else if (dryRun) {
      planned(`add ${plan.missingPermissions.length + plan.missingDirectories.length} entries to ${tildify(settingsPath())}`);
      summary.push(['Global permissions', 'would add']);
    } else {
      const res = applySettings({
        file: settingsPath(),
        permissions: GLOBAL_PERMISSIONS,
        directories: GLOBAL_DIRECTORIES,
      });
      good(`Updated ${tildify(res.file)}${res.backup ? ` (backup: ${tildify(res.backup)})` : ''}`);
      summary.push(['Global permissions', 'added']);
    }
  }

  // ---- 4. Ticket system credentials --------------------------------------
  step('Ticket system');
  const provider = await resolveProvider(flags, assumeYes);

  if (!provider || provider === 'none') {
    skipped('No provider selected -- tickets will be pasted manually.');
    summary.push(['Ticket system', 'none']);
  } else {
    const spec = PROVIDERS[provider];
    if (!spec.vars.length) {
      const gh = await checkGitHubCli();
      gh.status === 'ok' ? good(`${spec.label}: ${gh.detail}`) : fail(`${spec.label}: ${gh.detail} -- run: ${gh.fix}`);
      summary.push(['Ticket system', `${spec.label} (via gh)`]);
    } else {
      const result = await setupCredentials(provider, { dryRun, assumeYes, verify });
      summary.push(['Ticket system', `${spec.label} -- ${result}`]);
    }
  }

  // ---- 5. Knowledge base (optional) --------------------------------------
  step('Knowledge base (graphify)');
  summary.push(['Knowledge base', await setupGraphify({ dryRun, assumeYes })]);

  // ---- 6. Credential directory hygiene -----------------------------------
  const mode = claudeDirMode();
  if (mode && !['700', '750', '755'].includes(mode)) {
    warn(`${tildify(claudeDir())} is mode ${mode}. Credential files are 600, but consider chmod 700 on the directory.`);
  }

  closePrompts();

  heading('Summary');
  for (const [label, value] of summary) console.log(`  ${bold(label.padEnd(20))} ${value}`);

  heading('Next');
  info(`cd into a project and run:  ${bold('npx workticket init')}`);
  info(`then, inside Claude Code:   ${bold('/workticket TICKET-ID')}`);
  if (dryRun) {
    console.log('');
    warn('This was a dry run. Re-run without --dry-run to apply.');
  }
  return 0;
}

/**
 * graphify gives the analyze phase a real dependency graph instead of grep. It
 * is optional -- the workflow degrades to grep without it -- so a missing CLI is
 * reported, never treated as a failure, and nothing is installed unasked.
 */
async function setupGraphify({ dryRun, assumeYes }) {
  const state = await graphify.inspect();

  if (state.installed) {
    good(`graphify ${state.version ?? '(version unknown)'} available${state.mcp ? ', with graphify-mcp' : ''}`);
    return `graphify ${state.version ?? 'installed'}`;
  }

  const installer = await graphify.availableInstaller();
  if (!installer) {
    warn('graphify not installed, and no uv, pipx or pip3 on PATH to install it with.');
    info(dim('Optional -- the workflow falls back to grep. To add it later, install one of'));
    info(dim(`those, then: ${graphify.installCommands()[0]}`));
    return 'not installed (no installer available)';
  }

  info(`graphify is not installed. It is optional — without it the analyze phase uses grep.`);
  info(dim(`Would run: ${installer.label}`));

  if (dryRun) {
    planned(installer.label);
    return 'would install';
  }
  // Default to no: this pulls a third-party package from PyPI, so it should be a
  // deliberate yes rather than something a hurried --yes sweeps in.
  const go = !assumeYes && (await confirm('Install it now?', false));
  if (!go) {
    skipped(`Skipped. Install later with: ${installer.label}`);
    return 'skipped';
  }

  step(`Running ${installer.label}`);
  const res = await graphify.install(installer);
  if (res.ok) {
    good(`graphify ${res.version ?? ''} installed`.trim());
    return `installed ${res.version ?? ''}`.trim();
  }
  warn(`Install failed: ${res.error ?? 'unknown error'}`);
  info(dim(`Try it by hand: ${installer.label}`));
  return 'install failed';
}

async function resolveProvider(flags, assumeYes) {
  if (typeof flags.provider === 'string') {
    const p = flags.provider.toLowerCase();
    if (p === 'none' || PROVIDERS[p]) return p;
    throw new Error(`Unknown provider "${flags.provider}". Use jira, github-issues or none.`);
  }
  // Jira is the default: it is what the workflow is built around, and the only
  // provider needing a credential file, so defaulting elsewhere just means the
  // credential step silently never runs.
  if (assumeYes) return DEFAULT_PROVIDER;
  const labels = { jira: 'Jira', 'github-issues': 'GitHub Issues', none: 'None / paste manually' };
  const picked = await choose(
    'Which ticket system does your team use?',
    Object.values(labels),
    labels[DEFAULT_PROVIDER],
  );
  return Object.keys(labels).find((k) => labels[k] === picked) ?? DEFAULT_PROVIDER;
}

/**
 * Collect and store credentials. The token is read with a non-echoing prompt and
 * handed straight to writeCredentials -- it is never printed or logged.
 */
async function setupCredentials(provider, { dryRun, assumeYes, verify }) {
  const spec = PROVIDERS[provider];
  const existing = inspectCredentials(provider);

  if (existing.complete) {
    good(`Credentials already present in ${tildify(existing.file)}${existing.mode ? ` (mode ${existing.mode})` : ''}`);
    for (const [k, v] of Object.entries(existing.values)) info(dim(`${k} = ${v}`));
    if (verify) await reportVerification(provider);
    const replace = !assumeYes && !dryRun && (await confirm('Replace them?', false));
    if (!replace) return 'already configured';
  }

  if (assumeYes || !process.stdin.isTTY) {
    warn('Credentials incomplete and running non-interactively -- skipping.');
    info(dim(`Create ${tildify(existing.file)} with: ${spec.vars.join(', ')}`));
    return 'incomplete (non-interactive)';
  }

  console.log('');
  if (spec.tokenUrl) info(`Generate a token at: ${bold(spec.tokenUrl)}`);
  info(dim('Input for secrets is hidden. Values are written to a file only you can read (mode 600).'));
  console.log('');

  const values = {};
  for (const p of spec.prompts) {
    values[p.name] = p.secret ? await askSecret(p.question) : await ask(p.question, existing.values[p.name] ?? '');
  }

  const entered = spec.vars.filter((v) => values[v]);
  if (entered.length !== spec.vars.length) {
    warn(`Only ${entered.length} of ${spec.vars.length} values entered -- nothing written.`);
    return 'incomplete';
  }

  if (verify) {
    step('Verifying against the API');
    const res = await verifyCredentials(provider, values);
    if (res.ok) good(res.detail);
    else {
      fail(res.detail);
      const anyway = await confirm('Save them anyway?', false);
      if (!anyway) return 'not saved (verification failed)';
    }
  }

  if (dryRun) {
    planned(`write ${spec.vars.length} values to ${tildify(existing.file)} at mode 600`);
    return 'would write';
  }

  const res = writeCredentials(provider, values);
  if (res.chmodFailed) warn(`Wrote ${tildify(res.file)} but could not set mode 600 (not a POSIX filesystem).`);
  else good(`Wrote ${tildify(res.file)} (mode ${res.mode})`);
  return 'configured';
}

async function reportVerification(provider) {
  const info2 = inspectCredentials(provider);
  if (!info2.complete) return;
  const { parseEnvFile } = await import('./lib/keys.mjs');
  const { readFileSync } = await import('node:fs');
  const values = existsSync(info2.file) ? parseEnvFile(readFileSync(info2.file, 'utf8')) : {};
  for (const v of PROVIDERS[provider].vars) values[v] ??= process.env[v] ?? '';
  const res = await verifyCredentials(provider, values);
  res.ok ? good(`Verified: ${res.detail}`) : warn(`Verification failed: ${res.detail}`);
}
