// Project detection. Replaces the parts of setup.md where Claude had to guess
// the language, linter and test command by reading the repo -- a script does it
// deterministically from the build files, and the developer corrects it after.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const read = (dir, name) => {
  try {
    return readFileSync(join(dir, name), 'utf8');
  } catch {
    return null;
  }
};

const has = (dir, name) => existsSync(join(dir, name));

/**
 * Ordered most-specific first: a Roku repo has a manifest, a Gradle Android
 * repo has build.gradle, and a JS repo has package.json. First match wins.
 */
const STACKS = [
  {
    id: 'roku',
    label: 'Roku / BrightScript',
    when: (d) => has(d, 'manifest') && (has(d, 'components') || has(d, 'source')),
    versionSource: 'manifest',
    // Roku has no standard linter/test runner; leave blank rather than guess wrong.
    linter: '',
    fixer: '',
    test: '',
    testType: 'device',
  },
  {
    id: 'gradle',
    label: 'Java / Kotlin (Gradle)',
    when: (d) => has(d, 'build.gradle') || has(d, 'build.gradle.kts'),
    versionSource: (d) => (has(d, 'build.gradle.kts') ? 'build.gradle.kts' : 'build.gradle'),
    linter: (d) => (has(d, 'gradlew') ? './gradlew check' : 'gradle check'),
    fixer: '',
    test: (d) => (has(d, 'gradlew') ? './gradlew test' : 'gradle test'),
    testType: 'local',
  },
  {
    id: 'maven',
    label: 'Java (Maven)',
    when: (d) => has(d, 'pom.xml'),
    versionSource: 'pom.xml',
    linter: 'mvn checkstyle:check',
    fixer: '',
    test: 'mvn test',
    testType: 'local',
  },
  {
    id: 'node',
    label: 'JavaScript / TypeScript',
    when: (d) => has(d, 'package.json'),
    versionSource: 'package.json',
    linter: (d) => (pkgScript(d, 'lint') ? 'npm run lint' : ''),
    fixer: (d) => (pkgScript(d, 'lint') ? 'npm run lint -- --fix' : ''),
    test: (d) => (pkgScript(d, 'test') ? 'npm test' : ''),
    testType: 'local',
  },
  {
    id: 'python',
    label: 'Python',
    when: (d) => has(d, 'pyproject.toml') || has(d, 'setup.py') || has(d, 'requirements.txt'),
    versionSource: (d) => (has(d, 'pyproject.toml') ? 'pyproject.toml' : 'auto'),
    linter: (d) => (read(d, 'pyproject.toml')?.includes('ruff') ? 'ruff check .' : ''),
    fixer: (d) => (read(d, 'pyproject.toml')?.includes('ruff') ? 'ruff check . --fix' : ''),
    test: 'pytest',
    testType: 'local',
  },
  {
    id: 'go',
    label: 'Go',
    when: (d) => has(d, 'go.mod'),
    versionSource: 'auto',
    linter: 'go vet ./...',
    fixer: 'gofmt -w .',
    test: 'go test ./...',
    testType: 'local',
  },
];

function pkgJson(dir) {
  const raw = read(dir, 'package.json');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null; // malformed package.json is the repo's problem, not a crash here
  }
}

function pkgScript(dir, name) {
  return Boolean(pkgJson(dir)?.scripts?.[name]);
}

const resolveField = (value, dir) => (typeof value === 'function' ? value(dir) : value);

/**
 * Inspect a project directory. Every field may be empty -- an empty field means
 * "not detected", which the config treats as "feature disabled", never as an
 * excuse to invent a command that does not exist.
 */
export function detectProject(dir) {
  const stack = STACKS.find((s) => s.when(dir));
  const pkg = pkgJson(dir);

  return {
    stackId: stack?.id ?? 'unknown',
    language: stack?.label ?? '',
    name: pkg?.name ?? '',
    linterCommand: resolveField(stack?.linter, dir) || '',
    linterFixCommand: resolveField(stack?.fixer, dir) || '',
    testCommand: resolveField(stack?.test, dir) || '',
    testType: stack?.testType ?? '',
    versionSource: resolveField(stack?.versionSource, dir) || 'auto',
    prTemplate: findPrTemplate(dir),
  };
}

const PR_TEMPLATE_CANDIDATES = [
  '.github/pull_request_template.md',
  '.github/PULL_REQUEST_TEMPLATE.md',
  '.github/PULL_REQUEST_TEMPLATE/pull_request_template.md',
  'docs/pull_request_template.md',
];

export function findPrTemplate(dir) {
  return PR_TEMPLATE_CANDIDATES.find((p) => has(dir, p)) ?? '';
}

/** Skills installed on this machine, for the code_review.skill_name field. */
export function installedSkills(claudeSkillsDir) {
  if (!existsSync(claudeSkillsDir)) return [];
  return readdirSync(claudeSkillsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(claudeSkillsDir, e.name, 'SKILL.md')))
    .map((e) => e.name)
    .sort();
}
