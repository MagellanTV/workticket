// `workticket doctor` -- diagnose only. This command never writes.

import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { heading, table, info, dim, bold, OK, ERR, WARN, SKIP } from './lib/ui.mjs';
import { findRepoRoot, projectDataDir, tildify } from './lib/paths.mjs';
import { readConfig } from './lib/config.mjs';
import {
  checkGit, checkBaseBranch, checkGitHubCli, checkTicketSystem, checkCommand,
  checkReviewSkill, checkGraphify, checkSkillInstalled, checkProjectClaudeMd,
  checkPermissions, checkDynamicCommands, checkCredentialFileModes, checkPrTemplate, counts,
} from './lib/checks.mjs';

const STATUS = { ok: OK, warn: WARN, err: ERR, skip: SKIP };

export async function run({ flags = {} } = {}) {
  const cwd = process.cwd();
  const repoRoot = findRepoRoot(cwd);
  const verify = flags.verify !== false;

  heading('workticket doctor');
  info(`Project:  ${repoRoot ? tildify(repoRoot) : dim('not a git repository')}`);

  const dataDir = repoRoot ? projectDataDir(repoRoot) : null;
  const configFile = dataDir ? join(dataDir, 'config.md') : null;
  const config = configFile && existsSync(configFile) ? readConfig(configFile) : null;
  info(`Config:   ${config ? tildify(configFile) : dim('not found -- run: npx workticket init')}`);

  const rows = [];
  rows.push(checkSkillInstalled());

  if (repoRoot) {
    rows.push(...(await checkGit(repoRoot)));
    rows.push(await checkBaseBranch(repoRoot, config?.project?.base_branch));
  }

  rows.push(await checkGitHubCli());
  rows.push(await checkTicketSystem(config?.ticket_system?.provider ?? '', { verify }));
  rows.push(...checkCredentialFileModes());

  rows.push(await checkCommand('linter', 'Linter', config?.linter?.command ?? ''));
  rows.push(await checkCommand('tests', 'Test runner', config?.build_test?.test_command ?? ''));
  rows.push(await checkReviewSkill(config?.code_review?.skill_name ?? '', config?.code_review?.skill_path ?? ''));
  rows.push(await checkGraphify(repoRoot ?? cwd, Boolean(config?.knowledge?.graphify_enabled)));

  if (repoRoot) {
    rows.push(checkPrTemplate(repoRoot, config));
    rows.push(checkProjectClaudeMd(repoRoot));
    const perms = checkPermissions(repoRoot);
    rows.push(...perms.rows);
    rows.push(checkDynamicCommands(config, perms.allow));
  }

  heading('Results');
  table(
    ['#', 'Check', 'Status', 'Detail'],
    rows.map((r, i) => [String(i + 1), r.label, STATUS[r.status](), r.detail]),
  );

  const c = counts(rows);
  console.log('');
  info(`${c.ok} ok, ${c.warn} warning${c.warn === 1 ? '' : 's'}, ${c.err} error${c.err === 1 ? '' : 's'}, ${c.skip} skipped`);

  const actionable = rows.filter((r) => r.fix && r.status !== 'ok');
  if (actionable.length) {
    heading('Suggested fixes');
    for (const r of actionable) console.log(`  ${bold(r.label)}\n    ${r.fix}`);
  }

  return c.err > 0 ? 1 : 0;
}
