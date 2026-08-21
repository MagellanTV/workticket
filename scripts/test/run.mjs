// Zero-dependency test runner. Builds real git fixtures in a temp directory and
// exercises the installer's file surgery against them.

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

import { planGitignore, applyGitignore, inspectLegacy, migrateLegacy, dataCounts, isTracked } from '../lib/project.mjs';
import { detectProject } from '../lib/detect.mjs';
import { tildify, findRepoRoot } from '../lib/paths.mjs';
import {
  readSettings, planMerge, applySettings, renderPlan, backupSettings,
  uncoveredCommands, GLOBAL_PERMISSIONS, PROJECT_PERMISSIONS,
} from '../lib/settings.mjs';
import { parseConfig, parseBlock, setValue, applyEdits, editsFromDetection, extractBlocks } from '../lib/config.mjs';
import { parseEnvFile, renderEnvFile, PROVIDERS, inspectCredentials } from '../lib/keys.mjs';
import { InputClosedError, ask, confirm, choose, askSecret, confirmWrite } from '../lib/ui.mjs';
import * as graphify from '../lib/graphify.mjs';

let passed = 0;
const failures = [];

async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (err) {
    failures.push({ name, err });
    console.log(`  FAIL ${name}\n         ${err.message}`);
  }
}

const eq = (actual, expected, what = 'value') => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${what}: expected ${e}, got ${a}`);
};
const ok = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

const root = mkdtempSync(join(tmpdir(), 'workticket-test-'));
const git = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: 'ignore' });

/** A git repo with a legacy .claude/alfred-code/ tree. */
function fixture(name, { track = false, gitignore = null, extraFiles = {} } = {}) {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  git(dir, 'init');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'user.name', 'Test');

  for (const sub of ['plans', 'history', 'review']) {
    mkdirSync(join(dir, '.claude', 'alfred-code', sub), { recursive: true });
  }
  const legacy = join(dir, '.claude', 'alfred-code');
  writeFileSync(join(legacy, 'config.md'), '# Alfred-code — Project Configuration\nbase_branch: main\n');
  writeFileSync(join(legacy, 'plans', 'PROJ-1-v1.md'), 'saved to .claude/alfred-code/plans/PROJ-1-v1.md\n');
  writeFileSync(join(legacy, 'plans', 'README.md'), 'readme\n');
  writeFileSync(join(legacy, 'history', 'PROJ-1.md'), 'ran ~/.claude/skills/alfred-code/SKILL.md\n');
  writeFileSync(join(legacy, 'review', 'lessons.md'), 'lesson from alfred-code\n');

  for (const [rel, content] of Object.entries(extraFiles)) {
    const p = join(dir, rel);
    mkdirSync(join(p, '..'), { recursive: true });
    writeFileSync(p, content);
  }
  if (gitignore !== null) writeFileSync(join(dir, '.gitignore'), gitignore);

  if (track) {
    git(dir, 'add', '-A', '-f', '.claude');
    if (gitignore !== null) git(dir, 'add', '-f', '.gitignore');
    git(dir, 'commit', '-m', 'init');
  } else {
    writeFileSync(join(dir, 'placeholder.txt'), 'x');
    git(dir, 'add', 'placeholder.txt');
    git(dir, 'commit', '-m', 'init');
  }
  return dir;
}

const noAlfred = (dir) => {
  const hits = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name === '.git') continue;
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/alfred/i.test(readFileSync(p, 'utf8'))) hits.push(p);
    }
  };
  walk(dir);
  return hits;
};

console.log('\nGitignore planning');

await check('adds all entries to an empty .gitignore', () => {
  const p = planGitignore('');
  eq(p.missing.length, 4, 'missing count');
  ok(p.next.includes('# workticket workflow data'), 'workticket header present');
  ok(p.next.includes('graphify-out/'), 'graphify entry present');
});

await check('is idempotent -- second pass changes nothing', () => {
  const first = planGitignore('');
  const second = planGitignore(first.next);
  eq(second.changed, false, 'changed');
  eq(second.missing, [], 'missing');
});

await check('preserves unrelated user entries', () => {
  const p = planGitignore('node_modules/\ndist/\n');
  ok(p.next.startsWith('node_modules/\ndist/\n'), 'user entries kept at top');
  ok(p.next.includes('.claude/workticket/plans/'), 'new entry appended');
});

await check('rewrites legacy alfred-code lines in place, no duplicates', () => {
  const legacy = '# alfred-code workflow data\n.claude/alfred-code/plans/\n.claude/alfred-code/history/\n.claude/alfred-code/review/\n\n# graphify output\ngraphify-out/\n';
  const p = planGitignore(legacy);
  ok(!p.next.includes('alfred-code'), 'no alfred-code left');
  eq(p.missing, [], 'nothing missing after rewrite');
  eq((p.next.match(/\.claude\/workticket\/plans\//g) || []).length, 1, 'plans entry count');
  eq((p.next.match(/# workticket workflow data/g) || []).length, 1, 'header count');
});

await check('does not duplicate a header that already exists', () => {
  const partial = '# workticket workflow data\n.claude/workticket/plans/\n';
  const p = planGitignore(partial);
  eq((p.next.match(/# workticket workflow data/g) || []).length, 1, 'header count');
  ok(p.next.includes('.claude/workticket/history/'), 'missing entry added');
});

console.log('\nLegacy migration');

await check('CASE A: tracked legacy dir migrates via git mv, history preserved', () => {
  const dir = fixture('a', {
    track: true,
    gitignore: '# alfred-code workflow data\n.claude/alfred-code/plans/\n',
  });
  ok(isTracked(dir, '.claude/alfred-code'), 'fixture should be tracked');
  eq(inspectLegacy(dir).status, 'migrate', 'status');

  const res = migrateLegacy(dir);
  eq(res.method, 'git mv', 'method');
  ok(existsSync(join(dir, '.claude', 'workticket', 'config.md')), 'config moved');
  ok(!existsSync(join(dir, '.claude', 'alfred-code')), 'legacy dir gone');

  const status = execFileSync('git', ['status', '--porcelain'], { cwd: dir }).toString();
  ok(/^R/m.test(status), `git should record renames, got:\n${status}`);

  applyGitignore(dir);
  eq(noAlfred(dir), [], 'no alfred references anywhere');

  const cfg = readFileSync(join(dir, '.claude', 'workticket', 'config.md'), 'utf8');
  ok(cfg.startsWith('# Workticket'), `config header rewritten, got: ${cfg.split('\n')[0]}`);
});

await check('CASE B: untracked legacy dir migrates via plain rename', () => {
  const dir = fixture('b', { track: false, gitignore: 'node_modules/\n' });
  const res = migrateLegacy(dir);
  eq(res.method, 'mv', 'method');
  ok(existsSync(join(dir, '.claude', 'workticket', 'review', 'lessons.md')), 'lessons moved');
  applyGitignore(dir);
  eq(noAlfred(dir), [], 'no alfred references');
});

await check('CASE C: no .gitignore at all', () => {
  const dir = fixture('c', { track: false, gitignore: null });
  migrateLegacy(dir);
  const res = applyGitignore(dir);
  eq(res.created, true, 'created .gitignore');
  ok(readFileSync(join(dir, '.gitignore'), 'utf8').includes('graphify-out/'), 'entries written');
});

await check('CASE D: nothing to migrate is a no-op', () => {
  const dir = fixture('d', { track: false });
  rmSync(join(dir, '.claude', 'alfred-code'), { recursive: true });
  mkdirSync(join(dir, '.claude', 'workticket'), { recursive: true });
  eq(inspectLegacy(dir).status, 'current-only', 'status');
  const res = migrateLegacy(dir);
  eq(res.moved, false, 'moved');
});

await check('CASE E: both dirs present is a conflict, never auto-merged', () => {
  const dir = fixture('e', { track: false });
  mkdirSync(join(dir, '.claude', 'workticket'), { recursive: true });
  writeFileSync(join(dir, '.claude', 'workticket', 'config.md'), '# Workticket\nnew\n');
  eq(inspectLegacy(dir).status, 'conflict', 'status');
  const res = migrateLegacy(dir);
  eq(res.moved, false, 'must not move');
  ok(existsSync(join(dir, '.claude', 'alfred-code')), 'legacy dir untouched');
  ok(res.legacyFiles.length > 0 && res.currentFiles.length > 0, 'both sides listed for the developer');
});

await check('dry-run touches nothing but reports the method', () => {
  const dir = fixture('f', { track: true, gitignore: '.claude/alfred-code/plans/\n' });
  const res = migrateLegacy(dir, { dryRun: true });
  eq(res.moved, false, 'moved');
  eq(res.method, 'git mv', 'method still reported');
  ok(existsSync(join(dir, '.claude', 'alfred-code')), 'legacy dir still there');
  const gi = applyGitignore(dir, { dryRun: true });
  eq(gi.wrote, false, 'gitignore not written');
  ok(readFileSync(join(dir, '.gitignore'), 'utf8').includes('alfred-code'), 'file unchanged on disk');
});

await check('binary files are left alone during rewrite', () => {
  const dir = fixture('g', { track: false });
  const bin = join(dir, '.claude', 'alfred-code', 'blob.bin');
  const payload = Buffer.from([0x00, 0x01, 0x61, 0x6c, 0x66, 0x72, 0x65, 0x64, 0x2d, 0x63, 0x6f, 0x64, 0x65, 0x00]);
  writeFileSync(bin, payload);
  migrateLegacy(dir);
  const after = readFileSync(join(dir, '.claude', 'workticket', 'blob.bin'));
  eq([...after], [...payload], 'binary bytes unchanged');
});

console.log('\nProject detection');

await check('detects a Maven project', () => {
  const dir = join(root, 'det-maven');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'pom.xml'), '<project/>');
  const d = detectProject(dir);
  eq(d.stackId, 'maven', 'stack');
  eq(d.testCommand, 'mvn test', 'test command');
  eq(d.versionSource, 'pom.xml', 'version source');
});

await check('detects Gradle with wrapper and prefers ./gradlew', () => {
  const dir = join(root, 'det-gradle');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'build.gradle.kts'), '');
  writeFileSync(join(dir, 'gradlew'), '');
  const d = detectProject(dir);
  eq(d.stackId, 'gradle', 'stack');
  eq(d.testCommand, './gradlew test', 'test command');
  eq(d.versionSource, 'build.gradle.kts', 'version source');
});

await check('detects Roku by manifest plus components', () => {
  const dir = join(root, 'det-roku');
  mkdirSync(join(dir, 'components'), { recursive: true });
  writeFileSync(join(dir, 'manifest'), 'title=App');
  const d = detectProject(dir);
  eq(d.stackId, 'roku', 'stack');
  eq(d.testType, 'device', 'test type');
});

await check('leaves commands empty rather than inventing them', () => {
  const dir = join(root, 'det-node-bare');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'bare' }));
  const d = detectProject(dir);
  eq(d.linterCommand, '', 'linter');
  eq(d.testCommand, '', 'test');
});

await check('survives a malformed package.json', () => {
  const dir = join(root, 'det-broken');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), '{ not json');
  const d = detectProject(dir);
  eq(d.stackId, 'node', 'still identifies the stack');
  eq(d.name, '', 'no name extracted');
});

await check('finds a PR template', () => {
  const dir = join(root, 'det-pr');
  mkdirSync(join(dir, '.github'), { recursive: true });
  writeFileSync(join(dir, 'package.json'), '{}');
  writeFileSync(join(dir, '.github', 'pull_request_template.md'), '## What');
  eq(detectProject(dir).prTemplate, '.github/pull_request_template.md', 'template path');
});

await check('unknown stack degrades gracefully', () => {
  const dir = join(root, 'det-unknown');
  mkdirSync(dir, { recursive: true });
  const d = detectProject(dir);
  eq(d.stackId, 'unknown', 'stack');
  eq(d.language, '', 'language');
});

console.log('\nPaths');

await check('tildify never leaks the home path', () => {
  ok(!tildify(join(process.env.HOME, '.claude')).includes(process.env.HOME), 'home replaced');
  eq(tildify('/tmp/x'), '/tmp/x', 'non-home path untouched');
});

await check('findRepoRoot locates the enclosing repo', () => {
  const dir = fixture('rr', { track: false });
  const nested = join(dir, 'a', 'b');
  mkdirSync(nested, { recursive: true });
  eq(findRepoRoot(nested), dir, 'root');
});

await check('dataCounts ignores READMEs', () => {
  const dir = fixture('dc', { track: false });
  migrateLegacy(dir);
  const counts = dataCounts(join(dir, '.claude', 'workticket'));
  eq(counts, { plans: 1, history: 1 }, 'counts');
});

console.log('\nSettings merge');

const settingsFixture = (name, content) => {
  const dir = join(root, 'settings', name);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'settings.json');
  if (content !== null) writeFileSync(file, content);
  return file;
};

await check('creates a settings file that does not exist yet', () => {
  const file = settingsFixture('fresh', null);
  const res = applySettings({ file, permissions: GLOBAL_PERMISSIONS, directories: ['/home/x/.claude'] });
  eq(res.existed, false, 'existed');
  eq(res.wrote, true, 'wrote');
  eq(res.backup, null, 'nothing to back up');
  const data = JSON.parse(readFileSync(file, 'utf8'));
  eq(data.permissions.allow, GLOBAL_PERMISSIONS, 'allow');
  eq(data.permissions.additionalDirectories, ['/home/x/.claude'], 'dirs');
});

await check('preserves unrelated top-level keys', () => {
  const file = settingsFixture('unrelated', JSON.stringify({
    theme: 'dark', effortLevel: 'high', hooks: { PreToolUse: [{ matcher: 'Bash' }] },
    permissions: { allow: ['Bash(docker:*)'], defaultMode: 'acceptEdits' },
  }));
  applySettings({ file, permissions: PROJECT_PERMISSIONS });
  const data = JSON.parse(readFileSync(file, 'utf8'));
  eq(data.theme, 'dark', 'theme');
  eq(data.effortLevel, 'high', 'effortLevel');
  eq(data.hooks.PreToolUse[0].matcher, 'Bash', 'hooks');
  eq(data.permissions.defaultMode, 'acceptEdits', 'defaultMode');
});

await check('never removes or reorders what the user already had', () => {
  const existing = ['Bash(docker:*)', 'Bash(kubectl:*)', 'Bash(git:*)'];
  const file = settingsFixture('preserve', JSON.stringify({ permissions: { allow: existing } }));
  applySettings({ file, permissions: PROJECT_PERMISSIONS });
  const after = JSON.parse(readFileSync(file, 'utf8')).permissions.allow;
  eq(after.slice(0, 3), existing, 'original entries kept in original order at the front');
});

await check('never duplicates an entry the user already had', () => {
  const file = settingsFixture('nodupe', JSON.stringify({
    permissions: { allow: ['Bash(git:*)', 'Edit(**)', 'Write(**)'] },
  }));
  applySettings({ file, permissions: PROJECT_PERMISSIONS });
  const allow = JSON.parse(readFileSync(file, 'utf8')).permissions.allow;
  for (const p of ['Bash(git:*)', 'Edit(**)', 'Write(**)']) {
    eq(allow.filter((x) => x === p).length, 1, `occurrences of ${p}`);
  }
});

await check('is idempotent -- a second run writes nothing', () => {
  const file = settingsFixture('idem', null);
  applySettings({ file, permissions: PROJECT_PERMISSIONS });
  const second = applySettings({ file, permissions: PROJECT_PERMISSIONS });
  eq(second.changed, false, 'changed');
  eq(second.wrote, false, 'wrote');
  eq(second.missingPermissions, [], 'missing');
});

await check('refuses to overwrite malformed JSON', () => {
  const file = settingsFixture('broken', '{ "permissions": { oops }');
  let threw = null;
  try {
    applySettings({ file, permissions: PROJECT_PERMISSIONS });
  } catch (err) {
    threw = err;
  }
  ok(threw, 'should have thrown');
  ok(/not valid JSON/.test(threw.message), `message mentions the cause: ${threw?.message}`);
  eq(readFileSync(file, 'utf8'), '{ "permissions": { oops }', 'file left untouched');
});

await check('refuses a JSON file that is not an object', () => {
  const file = settingsFixture('array', '["nope"]');
  let threw = null;
  try {
    applySettings({ file, permissions: PROJECT_PERMISSIONS });
  } catch (err) { threw = err; }
  ok(threw && /does not contain a JSON object/.test(threw.message), 'rejected');
  eq(readFileSync(file, 'utf8'), '["nope"]', 'file untouched');
});

await check('treats an empty file as empty settings rather than an error', () => {
  const file = settingsFixture('empty', '   \n');
  const res = applySettings({ file, permissions: GLOBAL_PERMISSIONS });
  eq(res.wrote, true, 'wrote');
  eq(JSON.parse(readFileSync(file, 'utf8')).permissions.allow, GLOBAL_PERMISSIONS, 'allow');
});

await check('backs up an existing file before writing', () => {
  const file = settingsFixture('backup', JSON.stringify({ permissions: { allow: ['Bash(docker:*)'] } }));
  const res = applySettings({ file, permissions: PROJECT_PERMISSIONS });
  ok(res.backup, 'backup path returned');
  ok(existsSync(res.backup), 'backup exists on disk');
  const restored = JSON.parse(readFileSync(res.backup, 'utf8'));
  eq(restored.permissions.allow, ['Bash(docker:*)'], 'backup holds the pre-write content');
});

await check('dry-run reports the plan and touches nothing', () => {
  const before = JSON.stringify({ permissions: { allow: [] } });
  const file = settingsFixture('dry', before);
  const res = applySettings({ file, permissions: PROJECT_PERMISSIONS, dryRun: true });
  eq(res.wrote, false, 'wrote');
  ok(res.missingPermissions.length > 0, 'still reports what it would add');
  eq(readFileSync(file, 'utf8'), before, 'file unchanged');
});

await check('global scope stays read-only and confined to ~/.claude', () => {
  for (const p of GLOBAL_PERMISSIONS) {
    ok(p.startsWith('Read('), `global grant should be read-only, got ${p}`);
    ok(p.includes('.claude'), `global grant should be confined to ~/.claude, got ${p}`);
  }
  const writey = GLOBAL_PERMISSIONS.filter((p) => /^(Edit|Write|Bash)\(/.test(p));
  eq(writey, [], 'no write or bash grants in the global scope');
});

await check('renderPlan lists every addition and says nothing is removed', () => {
  const plan = planMerge({ permissions: { allow: ['Bash(git:*)'] } }, {
    permissions: ['Bash(git:*)', 'Bash(gh:*)'], directories: ['/x/.claude'],
  });
  const lines = renderPlan('/tmp/settings.json', plan).join('\n');
  ok(lines.includes('Bash(gh:*)'), 'lists the new permission');
  ok(!lines.includes('+ permissions.allow: Bash(git:*)'), 'does not list one already present');
  ok(/removed, reordered, or rewritten/.test(lines), 'states what it will not do');
});

await check('renderPlan says so when there is nothing to do', () => {
  const plan = planMerge({ permissions: { allow: ['Bash(git:*)'] } }, { permissions: ['Bash(git:*)'] });
  ok(renderPlan('/tmp/s.json', plan).join(' ').includes('nothing to add'), 'reports no-op');
});

await check('uncoveredCommands maps commands to the pattern they need', () => {
  const res = uncoveredCommands(['npm run lint', './gradlew test', 'mvn test', 'git status'], ['Bash(git:*)']);
  eq(res.map((r) => r.pattern), ['Bash(npm:*)', 'Bash(./gradlew:*)', 'Bash(mvn:*)'], 'patterns');
});

await check('uncoveredCommands ignores blanks and dedupes', () => {
  const res = uncoveredCommands(['npm run lint', 'npm test', '', '   ', null], []);
  eq(res.map((r) => r.pattern), ['Bash(npm:*)'], 'deduped to one npm pattern');
});

console.log('\nConfig parsing and writing');

const TEMPLATE = readFileSync(new URL('../../templates/config.md', import.meta.url), 'utf8');

await check('parses every section of the shipped template', () => {
  const c = parseConfig(TEMPLATE);
  for (const key of ['project','branch_naming','ticket_system','code_review','linter','build_test','pr_template','knowledge','changelog','git']) {
    ok(c[key] && typeof c[key] === 'object', `section ${key} parsed`);
  }
  eq(c.project.base_branch, 'main', 'base_branch');
  eq(c.git.commit_format, '[{ticket}] - {description}', 'commit_format keeps its braces');
});

await check('coerces booleans, numbers and empty strings', () => {
  const b = parseBlock('a: true\nb: false\nc: 42\nd: ""\ne: "x"\n');
  eq(b, { a: true, b: false, c: 42, d: '', e: 'x' }, 'scalars');
});

await check('parses inline flow sequences', () => {
  const b = parseBlock('labels:\n  bug: ["bug", "defect"]\n  none: []\n');
  eq(b.labels.bug, ['bug', 'defect'], 'inline array');
  eq(b.labels.none, [], 'empty inline array');
});

await check('keeps an explicit empty map as a map, not a list', () => {
  const b = parseBlock('path_labels: {}\nchecklist:\n');
  eq(b.path_labels, {}, 'explicit {} stays a map');
  eq(b.checklist, [], 'bare key with nothing under it becomes a list');
});

await check('parses dash lists under a key', () => {
  const b = parseBlock('refs:\n  - "a.md"\n  - "b.md"\n');
  eq(b.refs, ['a.md', 'b.md'], 'list');
});

await check('does not treat a # inside a quoted value as a comment', () => {
  const b = parseBlock('fmt: "[{ticket}] #{n}"   # trailing note\n');
  eq(b.fmt, '[{ticket}] #{n}', 'value');
});

await check('ignores comment-only and blank lines', () => {
  const b = parseBlock('# header\n\nkey: "v"\n#  other: "x"\n');
  eq(b, { key: 'v' }, 'only real keys');
});

await check('setValue preserves the inline comment', () => {
  const res = setValue(TEMPLATE, 'Project', 'base_branch', 'develop');
  ok(res.applied, 'applied');
  const line = res.text.split('\n').find((l) => l.trim().startsWith('base_branch:'));
  ok(line.includes('"develop"'), `new value written: ${line}`);
  ok(line.includes('# branch PRs target'), `comment kept: ${line}`);
});

await check('setValue writes booleans unquoted', () => {
  const res = setValue(TEMPLATE, 'Knowledge base', 'graphify_enabled', true);
  const line = res.text.split('\n').find((l) => l.trim().startsWith('graphify_enabled:'));
  ok(/graphify_enabled:\s+true\s+#/.test(line), `unquoted boolean: ${line}`);
});

await check('setValue reports a missing key instead of corrupting the file', () => {
  const res = setValue(TEMPLATE, 'Project', 'does_not_exist', 'x');
  eq(res.applied, false, 'applied');
  eq(res.text, TEMPLATE, 'markdown untouched');
  ok(/not found/.test(res.reason), 'reason given');
});

await check('setValue reports a missing section', () => {
  const res = setValue(TEMPLATE, 'No Such Section', 'k', 'v');
  eq(res.applied, false, 'applied');
  ok(/section .* not found/.test(res.reason), 'reason mentions the section');
});

await check('detected values round-trip through the template', () => {
  const detected = {
    name: 'acme', language: 'Java (Maven)', linterCommand: 'mvn checkstyle:check',
    linterFixCommand: '', testCommand: 'mvn test', testType: 'local',
    versionSource: 'pom.xml', prTemplate: '.github/pull_request_template.md',
  };
  const edits = editsFromDetection({
    detected, projectName: 'Acme API', baseBranch: 'develop',
    provider: 'jira', baseUrl: 'https://acme.atlassian.net', graphifyEnabled: false,
  });
  const res = applyEdits(TEMPLATE, edits);
  eq(res.missed, [], 'every edit found its key');
  const c = parseConfig(res.text);
  eq(c.project.name, 'Acme API', 'name');
  eq(c.project.base_branch, 'develop', 'base_branch');
  eq(c.ticket_system.provider, 'jira', 'provider');
  eq(c.linter.command, 'mvn checkstyle:check', 'linter');
  eq(c.build_test.test_command, 'mvn test', 'test command');
  eq(c.changelog.version_source, 'pom.xml', 'version source');
});

await check('applyEdits skips empty values rather than blanking the template', () => {
  const res = applyEdits(TEMPLATE, [
    { section: 'Project', key: 'base_branch', value: '' },
    { section: 'Project', key: 'name', value: undefined },
  ]);
  eq(res.applied, [], 'nothing applied');
  eq(parseConfig(res.text).project.base_branch, 'main', 'template default survives');
});

await check('a section edited twice keeps both values', () => {
  let text = setValue(TEMPLATE, 'Build & test', 'test_command', 'pytest').text;
  text = setValue(text, 'Build & test', 'test_type', 'local').text;
  const c = parseConfig(text);
  eq(c.build_test.test_command, 'pytest', 'first edit');
  eq(c.build_test.test_type, 'local', 'second edit');
});

await check('REGRESSION: a value containing $-patterns does not corrupt the file', () => {
  // `$&`, `$\``, `$'` and `$1` are substitution patterns in a String.replace
  // replacement STRING. The shipped template contains a style_checks example
  // ending in `$'`, so a string replacement expanded it into "everything after
  // the match" and silently duplicated or dropped chunks of the file.
  const before = parseConfig(TEMPLATE);
  const weird = "weird $& $` $' $1 name";
  const res = setValue(TEMPLATE, 'Project', 'name', weird);
  ok(res.applied, 'applied');

  const after = parseConfig(res.text);
  eq(after.project.name, weird, 'value written verbatim');
  for (const key of Object.keys(before)) {
    if (key === 'project') continue;
    eq(after[key], before[key], `section ${key} unchanged`);
  }
  // Structural integrity: same number of sections, same number of fences.
  eq(
    (res.text.match(/^## /gm) || []).length,
    (TEMPLATE.match(/^## /gm) || []).length,
    'section count',
  );
  eq(
    (res.text.match(/^```/gm) || []).length,
    (TEMPLATE.match(/^```/gm) || []).length,
    'code fence count',
  );
});

await check('REGRESSION: every $-bearing template line survives an unrelated edit', () => {
  // Derive the marker from the template instead of re-escaping it by hand.
  const dollarLines = TEMPLATE.split('\n').filter((l) => l.includes('$'));
  ok(dollarLines.length > 0, 'template really does contain $ characters to protect');

  const res = setValue(TEMPLATE, 'Build & test', 'test_command', 'mvn test');
  for (const line of dollarLines) {
    ok(res.text.includes(line), `line preserved verbatim: ${JSON.stringify(line.trim())}`);
  }
  eq(parseConfig(res.text).build_test.test_command, 'mvn test', 'edit still applied');
});

await check('REGRESSION: prose between a heading and its fence does not drop the section', () => {
  // Adding one explanatory line under `## Ticket system` made extractBlocks miss
  // the whole section, so parseConfig returned undefined for it and every edit
  // to it silently missed. Sections must tolerate prose.
  const md = [
    '## Project',
    '',
    'Some explanation of what this section is for.',
    '',
    '```yaml',
    'name: "x"',
    '```',
    '',
    '## Other',
    '',
    '```yaml',
    'flag: true',
    '```',
    '',
  ].join('\n');
  const blocks = extractBlocks(md);
  eq(Object.keys(blocks).sort(), ['Other', 'Project'], 'both sections found');
  eq(parseBlock(blocks.Project), { name: 'x' }, 'prose-preceded block parsed');
  const res = setValue(md, 'Project', 'name', 'y');
  ok(res.applied, 'setValue reaches a prose-preceded block');
  eq(parseConfig(res.text).project.name, 'y', 'edit landed');
});

await check('a section with no yaml fence does not swallow the next section', () => {
  const md = ['## Empty', '', 'Just prose, no config here.', '', '## Real', '', '```yaml', 'k: 1', '```', ''].join('\n');
  const blocks = extractBlocks(md);
  ok(!('Empty' in blocks), 'fence-less section produces no block');
  eq(parseBlock(blocks.Real), { k: 1 }, 'the next section keeps its own block');
});

console.log('\nCredential files');

await check('parses env files with and without export', () => {
  eq(parseEnvFile('export A="1"\nB=2\n# c\n\njunk\n'), { A: '1', B: '2' }, 'parsed');
});

await check('renders a sourceable file and escapes dangerous characters', () => {
  const text = renderEnvFile('jira', { JIRA_API_TOKEN: 'a"b$c`d' });
  ok(text.includes('export JIRA_API_TOKEN='), 'export form');
  ok(text.includes('\\"'), 'quote escaped');
  ok(text.includes('\\$'), 'dollar escaped');
  ok(text.includes('\\`'), 'backtick escaped');
});

await check('env file round-trips a token with shell metacharacters', () => {
  const token = 'tok-with-$VAR-and-`cmd`-and-"quote"';
  const rendered = renderEnvFile('jira', { JIRA_API_TOKEN: token });
  // What bash would see after unescaping inside double quotes.
  const value = rendered.match(/export JIRA_API_TOKEN="(.*)"/)[1];
  eq(value.replace(/\\([$`"\\])/g, '$1'), token, 'token survives escaping');
});

await check('github-issues needs no credential file', () => {
  eq(PROVIDERS['github-issues'].vars, [], 'no vars');
  eq(PROVIDERS['github-issues'].secretVars, [], 'no secrets to handle');
});

await check('every provider secret is listed as a secret var', () => {
  for (const [name, spec] of Object.entries(PROVIDERS)) {
    for (const v of spec.vars) {
      if (/TOKEN|KEY|SECRET|PASSWORD/i.test(v)) {
        ok(spec.secretVars.includes(v), `${name}.${v} must be marked secret`);
      }
    }
  }
});

console.log('\nNon-interactive behaviour');

await check('InputClosedError carries a stable code the CLI can branch on', () => {
  const err = new InputClosedError();
  eq(err.code, 'INPUT_CLOSED', 'code');
  eq(err.name, 'InputClosedError', 'name');
  ok(err instanceof Error, 'is an Error');
  ok(/stdin closed/.test(err.message), 'message explains the cause');
});

/**
 * Run fn with stdin forced to look non-interactive, then restore it.
 *
 * These tests must never reach a real prompt. Asserting the ambient TTY state
 * instead made the whole suite unrunnable from a terminal: the precondition
 * failed, and then askSecret() opened an actual hidden-input prompt and blocked
 * forever waiting to be typed into. Forcing the flag makes the test mean the
 * same thing whether stdin is a pipe or a terminal.
 */
async function withoutTty(fn) {
  const original = process.stdin.isTTY;
  process.stdin.isTTY = false;
  try {
    return await fn();
  } finally {
    process.stdin.isTTY = original;
  }
}

await check('prompts fall back instead of hanging when stdin is not a TTY', async () => {
  await withoutTty(async () => {
    eq(await ask('anything?', 'fallback'), 'fallback', 'ask returns its fallback');
    eq(await confirm('ok?', false), false, 'confirm returns its fallback');
    eq(await choose('pick', ['a', 'b'], 'b'), 'b', 'choose returns its fallback');
    eq(await askSecret('token?'), '', 'askSecret yields nothing rather than blocking');
  });
});

await check('askSecret never returns a value it could not have read', async () => {
  // Guards against a future refactor that makes the non-TTY path echo or
  // fabricate a secret. Empty is the only safe answer.
  await withoutTty(async () => {
    eq(await askSecret('token?'), '', 'empty');
  });
});

await check('no test can open an interactive prompt', () => {
  // Every prompt call must sit inside a withoutTty callback, or `npm test` from
  // a terminal hangs. Fail loudly if a bare one is ever added.
  const src = readFileSync(new URL('./run.mjs', import.meta.url), 'utf8');
  const helperAt = src.indexOf('async function withoutTty');
  ok(helperAt > 0, 'helper is defined');
  const offenders = [];
  const re = /await (ask|confirm|choose|askSecret)\(/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    if (m.index < helperAt) offenders.push(m[1]);
  }
  eq(offenders, [], 'no prompt is called before the helper that guards it');
});

await check('confirmWrite declines when nobody can answer and --yes was not passed', async () => {
  // The bug this replaces: confirm(q, true) returned its `true` fallback with no
  // TTY, so a non-interactive run applied 25 permission entries having asked
  // nothing. A prompt nobody can answer is not consent.
  const res = await confirmWrite('Add these entries?', { assumeYes: false, interactive: false });
  eq(res.ok, false, 'declines');
  ok(/--yes/.test(res.reason), `reason names the flag to pass: ${res.reason}`);
});

await check('confirmWrite proceeds only on an explicit --yes when non-interactive', async () => {
  const res = await confirmWrite('Add these entries?', { assumeYes: true, interactive: false });
  eq(res.ok, true, 'proceeds');
  ok(/--yes/.test(res.reason), 'reason records why');
});

await check('confirmWrite treats --yes as consent even with a terminal present', async () => {
  const res = await confirmWrite('Add these entries?', { assumeYes: true, interactive: true });
  eq(res.ok, true, 'proceeds without prompting');
});

await check('no command asks a write question with a yes-by-default fallback', () => {
  // confirm(q, true) is the shape that caused the bug. Any consequential
  // question must go through confirmWrite instead.
  const offenders = [];
  for (const file of ['install.mjs', 'init.mjs', 'doctor.mjs']) {
    const src = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    const re = /confirm\([^)]*,\s*true\s*\)/g;
    if (re.test(src)) offenders.push(file);
  }
  eq(offenders, [], 'commands use confirmWrite for anything that writes');
});

console.log('\nTicket providers');

await check('Linear is gone from the provider set', () => {
  eq(Object.keys(PROVIDERS).sort(), ['github-issues', 'jira'], 'providers');
  ok(!('linear' in PROVIDERS), 'no linear key');
});

await check('no provider declares a Linear variable', () => {
  for (const [name, spec] of Object.entries(PROVIDERS)) {
    for (const v of [...spec.vars, ...spec.secretVars]) {
      ok(!/LINEAR/i.test(v), `${name} still references ${v}`);
    }
  }
});

await check('jira is the default provider in the shipped template', () => {
  eq(parseConfig(TEMPLATE).ticket_system.provider, 'jira', 'template default');
});

await check('the default provider is one that actually exists', () => {
  // Guards against the default drifting to a provider that was removed, which
  // would make every fresh config fail its own ticket-system check.
  eq(Object.keys(PROVIDERS).includes('jira'), true, 'jira is a known provider');
});

await check('inspectCredentials never exposes a secret value', () => {
  // The base URL and email are reused to prefill prompts; the token must only
  // ever be reported as a boolean.
  for (const [name, spec] of Object.entries(PROVIDERS)) {
    const info = inspectCredentials(name);
    if (!info.known) continue;
    for (const secret of spec.secretVars) {
      ok(!(secret in (info.values ?? {})), `${name}: ${secret} must not appear in .values`);
      ok(typeof info.vars?.[secret]?.set === 'boolean', `${name}: ${secret} reported as a boolean`);
    }
  }
});

console.log('\nGraphify');

await check('the package name is graphifyy, not graphify or graphify-cli', () => {
  // graphify and graphify-cli both 404 on PyPI; the old setup.md told people to
  // install graphify-cli, which could never have worked.
  eq(graphify.PACKAGE_NAME, 'graphifyy', 'package name');
  for (const cmd of graphify.installCommands()) {
    ok(cmd.endsWith(' graphifyy'), `install command targets the right package: ${cmd}`);
    ok(!/graphify-cli/.test(cmd), `no graphify-cli in: ${cmd}`);
  }
});

await check('installers are ordered isolated-first', () => {
  const ids = graphify.installCommands();
  ok(ids[0].startsWith('uv '), `uv first, got ${ids[0]}`);
  ok(ids.at(-1).startsWith('pip3 '), `bare pip last, got ${ids.at(-1)}`);
});

await check('hasGraph looks for graphify-out/graph.json', () => {
  const dir = join(root, 'gfy-graph');
  mkdirSync(join(dir, 'graphify-out'), { recursive: true });
  eq(graphify.hasGraph(dir), false, 'absent before');
  writeFileSync(join(dir, 'graphify-out', 'graph.json'), '{}');
  eq(graphify.hasGraph(dir), true, 'present after');
});

await check('a missing installer binary fails cleanly instead of throwing', async () => {
  const res = await graphify.install({ binary: 'workticket-no-such-binary-xyz', args: ['x'], label: 'nope' });
  eq(res.ok, false, 'ok');
  ok(res.error && res.error.length > 0, 'reports an error');
  ok(!/undefined/.test(res.error), `error is readable: ${res.error}`);
});

await check('inspect reports a boolean even when the CLI is absent', async () => {
  const state = await graphify.inspect();
  eq(typeof state.installed, 'boolean', 'installed is a boolean');
  ok(state.installed === false || state.version === null || typeof state.version === 'string', 'version shape');
});

console.log('');
console.log(`${passed} passed, ${failures.length} failed`);
rmSync(root, { recursive: true, force: true });
process.exit(failures.length ? 1 : 0);
