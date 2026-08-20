// graphify -- the optional knowledge-graph backend the analyze phase prefers
// over grep.
//
// The package is `graphifyy` on PyPI (two y's) and it ships two binaries,
// `graphify` and `graphify-mcp`. The old setup.md told people to run
// `pip install graphify-cli`, which does not exist on PyPI at all -- that
// instruction could never have worked.
//
// Installing it is optional: without it the workflow falls back to grep. So
// nothing here installs anything without being asked, and a missing graphify is
// a warning, never an error.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const exec = promisify(execFile);

export const PACKAGE_NAME = 'graphifyy';

/**
 * Installers we know how to drive, best first.
 *   uv and pipx put the tool in its own environment, which is what you want for
 *   a CLI. Plain pip is last because it installs into whatever environment
 *   happens to be active.
 */
const INSTALLERS = [
  { id: 'uv', binary: 'uv', args: ['tool', 'install', PACKAGE_NAME], label: `uv tool install ${PACKAGE_NAME}` },
  { id: 'pipx', binary: 'pipx', args: ['install', PACKAGE_NAME], label: `pipx install ${PACKAGE_NAME}` },
  { id: 'pip3', binary: 'pip3', args: ['install', PACKAGE_NAME], label: `pip3 install ${PACKAGE_NAME}` },
];

async function onPath(binary) {
  try {
    const { stdout } = await exec(process.platform === 'win32' ? 'where' : 'which', [binary], { timeout: 5000 });
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

/** Which known installer is available on this machine, if any. */
export async function availableInstaller() {
  for (const installer of INSTALLERS) {
    if (await onPath(installer.binary)) return installer;
  }
  return null;
}

/** All install commands, for showing the developer their options. */
export const installCommands = () => INSTALLERS.map((i) => i.label);

/**
 * Is the CLI present, and what version. Returns
 * { installed, version, path, mcp } -- mcp reports the companion binary, which
 * is what a Claude Code MCP server config would point at.
 */
export async function inspect() {
  if (!(await onPath('graphify'))) {
    return { installed: false, version: null, mcp: false };
  }
  let version = null;
  try {
    const { stdout } = await exec('graphify', ['--version'], { timeout: 10000 });
    version = stdout.trim().split(/\s+/).at(-1) ?? null;
  } catch {
    // Present but not answering --version: still installed, just unknown.
  }
  return { installed: true, version, mcp: await onPath('graphify-mcp') };
}

/**
 * Pull the informative part out of an installer's failure output.
 *
 * Taking the last few lines does not work: pip ends a failed run with its own
 * "a new release of pip is available" notice, which would be reported as the
 * reason the install failed. So drop the known noise first, then prefer a line
 * that actually names an error.
 */
function explainFailure(text) {
  const lines = String(text ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !/^\[notice\]/i.test(l))
    .filter((l) => !/^WARNING: (You are using|There was an error checking)/i.test(l));

  const named = lines.filter((l) => /^(ERROR|error)\b|No matching distribution|Could not find|not found|failed/i.test(l));
  const useful = (named.length ? named : lines).slice(-2).join(' ');
  return useful.slice(0, 300) || 'no output';
}

/**
 * Run the install. The caller must have asked first -- this pulls a third-party
 * package from PyPI, which is not something to do unprompted.
 */
export async function install(installer, { timeoutMs = 180000 } = {}) {
  try {
    const { stdout, stderr } = await exec(installer.binary, installer.args, { timeout: timeoutMs });
    const after = await inspect();
    return { ok: after.installed, version: after.version, output: `${stdout}${stderr}`.trim() };
  } catch (err) {
    if (err.killed || err.signal) return { ok: false, version: null, error: `timed out after ${timeoutMs / 1000}s` };
    return { ok: false, version: null, error: explainFailure(err.stderr || err.stdout || err.message) };
  }
}

/** Has a graph been built for this project yet? */
export const hasGraph = (projectDir) => existsSync(join(projectDir, 'graphify-out', 'graph.json'));

/** Build the graph for a project. Can take a while on a large repo. */
export async function build(projectDir, { timeoutMs = 600000 } = {}) {
  try {
    await exec('graphify', ['build'], { cwd: projectDir, timeout: timeoutMs });
    return { ok: hasGraph(projectDir) };
  } catch (err) {
    if (err.killed || err.signal) return { ok: false, error: `timed out after ${timeoutMs / 1000}s` };
    return { ok: false, error: explainFailure(err.stderr || err.stdout || err.message) };
  }
}
