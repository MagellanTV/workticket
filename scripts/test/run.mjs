// Zero-dependency test runner. Builds real git fixtures in a temp directory and
// exercises the installer's file surgery against them.

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

import { planGitignore, applyGitignore, inspectLegacy, migrateLegacy, dataCounts, isTracked } from '../lib/project.mjs';
import { detectProject } from '../lib/detect.mjs';
import { tildify, findRepoRoot } from '../lib/paths.mjs';

let passed = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
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

check('adds all entries to an empty .gitignore', () => {
  const p = planGitignore('');
  eq(p.missing.length, 4, 'missing count');
  ok(p.next.includes('# workticket workflow data'), 'workticket header present');
  ok(p.next.includes('graphify-out/'), 'graphify entry present');
});

check('is idempotent -- second pass changes nothing', () => {
  const first = planGitignore('');
  const second = planGitignore(first.next);
  eq(second.changed, false, 'changed');
  eq(second.missing, [], 'missing');
});

check('preserves unrelated user entries', () => {
  const p = planGitignore('node_modules/\ndist/\n');
  ok(p.next.startsWith('node_modules/\ndist/\n'), 'user entries kept at top');
  ok(p.next.includes('.claude/workticket/plans/'), 'new entry appended');
});

check('rewrites legacy alfred-code lines in place, no duplicates', () => {
  const legacy = '# alfred-code workflow data\n.claude/alfred-code/plans/\n.claude/alfred-code/history/\n.claude/alfred-code/review/\n\n# graphify output\ngraphify-out/\n';
  const p = planGitignore(legacy);
  ok(!p.next.includes('alfred-code'), 'no alfred-code left');
  eq(p.missing, [], 'nothing missing after rewrite');
  eq((p.next.match(/\.claude\/workticket\/plans\//g) || []).length, 1, 'plans entry count');
  eq((p.next.match(/# workticket workflow data/g) || []).length, 1, 'header count');
});

check('does not duplicate a header that already exists', () => {
  const partial = '# workticket workflow data\n.claude/workticket/plans/\n';
  const p = planGitignore(partial);
  eq((p.next.match(/# workticket workflow data/g) || []).length, 1, 'header count');
  ok(p.next.includes('.claude/workticket/history/'), 'missing entry added');
});

console.log('\nLegacy migration');

check('CASE A: tracked legacy dir migrates via git mv, history preserved', () => {
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

check('CASE B: untracked legacy dir migrates via plain rename', () => {
  const dir = fixture('b', { track: false, gitignore: 'node_modules/\n' });
  const res = migrateLegacy(dir);
  eq(res.method, 'mv', 'method');
  ok(existsSync(join(dir, '.claude', 'workticket', 'review', 'lessons.md')), 'lessons moved');
  applyGitignore(dir);
  eq(noAlfred(dir), [], 'no alfred references');
});

check('CASE C: no .gitignore at all', () => {
  const dir = fixture('c', { track: false, gitignore: null });
  migrateLegacy(dir);
  const res = applyGitignore(dir);
  eq(res.created, true, 'created .gitignore');
  ok(readFileSync(join(dir, '.gitignore'), 'utf8').includes('graphify-out/'), 'entries written');
});

check('CASE D: nothing to migrate is a no-op', () => {
  const dir = fixture('d', { track: false });
  rmSync(join(dir, '.claude', 'alfred-code'), { recursive: true });
  mkdirSync(join(dir, '.claude', 'workticket'), { recursive: true });
  eq(inspectLegacy(dir).status, 'current-only', 'status');
  const res = migrateLegacy(dir);
  eq(res.moved, false, 'moved');
});

check('CASE E: both dirs present is a conflict, never auto-merged', () => {
  const dir = fixture('e', { track: false });
  mkdirSync(join(dir, '.claude', 'workticket'), { recursive: true });
  writeFileSync(join(dir, '.claude', 'workticket', 'config.md'), '# Workticket\nnew\n');
  eq(inspectLegacy(dir).status, 'conflict', 'status');
  const res = migrateLegacy(dir);
  eq(res.moved, false, 'must not move');
  ok(existsSync(join(dir, '.claude', 'alfred-code')), 'legacy dir untouched');
  ok(res.legacyFiles.length > 0 && res.currentFiles.length > 0, 'both sides listed for the developer');
});

check('dry-run touches nothing but reports the method', () => {
  const dir = fixture('f', { track: true, gitignore: '.claude/alfred-code/plans/\n' });
  const res = migrateLegacy(dir, { dryRun: true });
  eq(res.moved, false, 'moved');
  eq(res.method, 'git mv', 'method still reported');
  ok(existsSync(join(dir, '.claude', 'alfred-code')), 'legacy dir still there');
  const gi = applyGitignore(dir, { dryRun: true });
  eq(gi.wrote, false, 'gitignore not written');
  ok(readFileSync(join(dir, '.gitignore'), 'utf8').includes('alfred-code'), 'file unchanged on disk');
});

check('binary files are left alone during rewrite', () => {
  const dir = fixture('g', { track: false });
  const bin = join(dir, '.claude', 'alfred-code', 'blob.bin');
  const payload = Buffer.from([0x00, 0x01, 0x61, 0x6c, 0x66, 0x72, 0x65, 0x64, 0x2d, 0x63, 0x6f, 0x64, 0x65, 0x00]);
  writeFileSync(bin, payload);
  migrateLegacy(dir);
  const after = readFileSync(join(dir, '.claude', 'workticket', 'blob.bin'));
  eq([...after], [...payload], 'binary bytes unchanged');
});

console.log('\nProject detection');

check('detects a Maven project', () => {
  const dir = join(root, 'det-maven');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'pom.xml'), '<project/>');
  const d = detectProject(dir);
  eq(d.stackId, 'maven', 'stack');
  eq(d.testCommand, 'mvn test', 'test command');
  eq(d.versionSource, 'pom.xml', 'version source');
});

check('detects Gradle with wrapper and prefers ./gradlew', () => {
  const dir = join(root, 'det-gradle');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'build.gradle.kts'), '');
  writeFileSync(join(dir, 'gradlew'), '');
  const d = detectProject(dir);
  eq(d.stackId, 'gradle', 'stack');
  eq(d.testCommand, './gradlew test', 'test command');
  eq(d.versionSource, 'build.gradle.kts', 'version source');
});

check('detects Roku by manifest plus components', () => {
  const dir = join(root, 'det-roku');
  mkdirSync(join(dir, 'components'), { recursive: true });
  writeFileSync(join(dir, 'manifest'), 'title=App');
  const d = detectProject(dir);
  eq(d.stackId, 'roku', 'stack');
  eq(d.testType, 'device', 'test type');
});

check('leaves commands empty rather than inventing them', () => {
  const dir = join(root, 'det-node-bare');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'bare' }));
  const d = detectProject(dir);
  eq(d.linterCommand, '', 'linter');
  eq(d.testCommand, '', 'test');
});

check('survives a malformed package.json', () => {
  const dir = join(root, 'det-broken');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), '{ not json');
  const d = detectProject(dir);
  eq(d.stackId, 'node', 'still identifies the stack');
  eq(d.name, '', 'no name extracted');
});

check('finds a PR template', () => {
  const dir = join(root, 'det-pr');
  mkdirSync(join(dir, '.github'), { recursive: true });
  writeFileSync(join(dir, 'package.json'), '{}');
  writeFileSync(join(dir, '.github', 'pull_request_template.md'), '## What');
  eq(detectProject(dir).prTemplate, '.github/pull_request_template.md', 'template path');
});

check('unknown stack degrades gracefully', () => {
  const dir = join(root, 'det-unknown');
  mkdirSync(dir, { recursive: true });
  const d = detectProject(dir);
  eq(d.stackId, 'unknown', 'stack');
  eq(d.language, '', 'language');
});

console.log('\nPaths');

check('tildify never leaks the home path', () => {
  ok(!tildify(join(process.env.HOME, '.claude')).includes(process.env.HOME), 'home replaced');
  eq(tildify('/tmp/x'), '/tmp/x', 'non-home path untouched');
});

check('findRepoRoot locates the enclosing repo', () => {
  const dir = fixture('rr', { track: false });
  const nested = join(dir, 'a', 'b');
  mkdirSync(nested, { recursive: true });
  eq(findRepoRoot(nested), dir, 'root');
});

check('dataCounts ignores READMEs', () => {
  const dir = fixture('dc', { track: false });
  migrateLegacy(dir);
  const counts = dataCounts(join(dir, '.claude', 'workticket'));
  eq(counts, { plans: 1, history: 1 }, 'counts');
});

console.log('');
console.log(`${passed} passed, ${failures.length} failed`);
rmSync(root, { recursive: true, force: true });
process.exit(failures.length ? 1 : 0);
