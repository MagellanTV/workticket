// Ticket-system credentials.
//
// The token is typed by the developer into their own terminal (non-echoing) and
// goes straight into a file with 0600 permissions. It is never printed, never
// logged, and never passed as a command-line argument where it would show up in
// shell history or in `ps` output.
//
// Files live at ~/.claude/.{provider}-env and are sourced by the skill at
// runtime. Nothing is ever added to the user's shell rc: a stray `export
// JIRA_API_TOKEN=...` in .zshrc leaks the token into every process they start.

import { writeFileSync, readFileSync, existsSync, chmodSync, statSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { envFilePath, claudeDir } from './paths.mjs';

export const PROVIDERS = {
  jira: {
    label: 'Jira',
    vars: ['JIRA_BASE_URL', 'JIRA_USER_EMAIL', 'JIRA_API_TOKEN'],
    secretVars: ['JIRA_API_TOKEN'],
    tokenUrl: 'https://id.atlassian.com/manage-profile/security/api-tokens',
    prompts: [
      { name: 'JIRA_BASE_URL', question: 'Jira base URL (https://your-team.atlassian.net):', secret: false },
      { name: 'JIRA_USER_EMAIL', question: 'Jira account email:', secret: false },
      { name: 'JIRA_API_TOKEN', question: 'Jira API token (input hidden):', secret: true },
    ],
  },
  'github-issues': {
    label: 'GitHub Issues',
    vars: [],
    secretVars: [],
    // Auth comes from `gh auth login`; we never handle a GitHub token ourselves.
    tokenUrl: null,
    prompts: [],
  },
};

/**
 * Read one value from the right-hand side of a `KEY=` line, the way a shell
 * would: a quoted value ends at its closing quote and anything after it is a
 * comment; an unquoted value ends at whitespace-then-#.
 *
 * The naive version only unquoted when the value both started and ended with a
 * quote, so a perfectly ordinary line --
 *   export JIRA_USER_EMAIL="me@example.com"   # or your work email
 * -- yielded `"me@example.com"   # or your work email`, quotes and comment
 * included. That went straight into a Basic auth header and came back 401,
 * while `source`-ing the same file worked, because bash strips the comment.
 * A credential silently corrupted by its own comment is a nasty way to lose an
 * afternoon.
 */
function readValue(rest) {
  const text = rest.trimStart();
  const quote = text[0];
  if (quote === '"' || quote === "'") {
    // Walk to the closing quote, honouring backslash escapes inside "..." only,
    // matching how the shell treats each quoting style.
    let value = '';
    for (let i = 1; i < text.length; i++) {
      const ch = text[i];
      if (ch === '\\' && quote === '"' && i + 1 < text.length) {
        value += text[++i];
        continue;
      }
      if (ch === quote) return value;
      value += ch;
    }
    return value; // unterminated quote: take what there is
  }
  // Unquoted: a # only opens a comment when whitespace precedes it, so a value
  // like tok#1 stays intact.
  const comment = text.search(/\s#/);
  return (comment === -1 ? text : text.slice(0, comment)).trim();
}

/** Parse a `.env`-style file into a plain object. */
export function parseEnvFile(text) {
  const out = {};
  for (const raw of String(text ?? '').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    out[m[1]] = readValue(m[2]);
  }
  return out;
}

/** Serialize back to the `export KEY="value"` form the skill sources. */
export function renderEnvFile(provider, values) {
  const header = [
    `# workticket -- ${PROVIDERS[provider]?.label ?? provider} credentials`,
    '# Sourced by the workflow at runtime. Keep this file at mode 600.',
    '# Do not commit it and do not move these into your shell rc.',
    '',
  ];
  const body = Object.entries(values).map(([k, v]) => `export ${k}="${String(v).replace(/(["\\$`])/g, '\\$1')}"`);
  return header.concat(body, '').join('\n');
}

/**
 * What is already configured for a provider. Reports whether each variable is
 * set without ever returning a secret value -- callers get booleans, and the
 * non-secret values (base URL, email) so they can be shown back for confirmation.
 */
export function inspectCredentials(provider, env = process.env) {
  const spec = PROVIDERS[provider];
  if (!spec) return { provider, known: false };

  const file = envFilePath(provider);
  const fromFile = existsSync(file) ? parseEnvFile(readFileSync(file, 'utf8')) : {};

  const status = {};
  const shown = {};
  for (const name of spec.vars) {
    const value = fromFile[name] || env[name] || '';
    status[name] = {
      set: Boolean(value),
      // "where" tells the developer why a stale value is winning
      source: fromFile[name] ? 'file' : env[name] ? 'environment' : null,
    };
    if (value && !spec.secretVars.includes(name)) shown[name] = value;
  }

  return {
    provider,
    known: true,
    label: spec.label,
    file,
    fileExists: existsSync(file),
    mode: existsSync(file) ? (statSync(file).mode & 0o777).toString(8).padStart(3, '0') : null,
    vars: status,
    values: shown,
    missing: spec.vars.filter((v) => !status[v].set),
    complete: spec.vars.every((v) => status[v].set),
    needsCredentialFile: spec.vars.length > 0,
  };
}

/**
 * Write the credential file at mode 600. Existing values are merged so a
 * partial re-run does not wipe a token the developer already entered.
 */
export function writeCredentials(provider, values, { dryRun = false } = {}) {
  const file = envFilePath(provider);
  const existing = existsSync(file) ? parseEnvFile(readFileSync(file, 'utf8')) : {};
  const merged = { ...existing };
  for (const [k, v] of Object.entries(values)) {
    if (v !== undefined && v !== null && v !== '') merged[k] = v;
  }
  if (dryRun) return { file, wrote: false, mode: '600', keys: Object.keys(merged) };

  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, renderEnvFile(provider, merged), { encoding: 'utf8', mode: 0o600 });
  // Set the mode explicitly too: the mode option only applies on creation, so an
  // existing world-readable file would otherwise keep its old permissions.
  try {
    chmodSync(file, 0o600);
  } catch {
    // Windows has no POSIX modes. Not fatal -- report it and move on.
    return { file, wrote: true, mode: null, keys: Object.keys(merged), chmodFailed: true };
  }
  return { file, wrote: true, mode: '600', keys: Object.keys(merged) };
}

/** Ensure ~/.claude itself is not world-readable, since credentials live there. */
export function claudeDirMode() {
  const dir = claudeDir();
  if (!existsSync(dir)) return null;
  return (statSync(dir).mode & 0o777).toString(8).padStart(3, '0');
}

/**
 * Live credential check. Returns { ok, status, detail } and never echoes the
 * token. Uses global fetch (Node 18+), with a timeout so a hung network does
 * not stall the installer.
 */
export async function verifyCredentials(provider, values, { timeoutMs = 10000 } = {}) {
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    if (provider === 'jira') {
      const { JIRA_BASE_URL, JIRA_USER_EMAIL, JIRA_API_TOKEN } = values;
      if (!JIRA_BASE_URL || !JIRA_USER_EMAIL || !JIRA_API_TOKEN) {
        return { ok: false, status: null, detail: 'credentials incomplete' };
      }
      const auth = Buffer.from(`${JIRA_USER_EMAIL}:${JIRA_API_TOKEN}`).toString('base64');
      const res = await fetch(`${JIRA_BASE_URL.replace(/\/+$/, '')}/rest/api/3/myself`, {
        headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
        signal,
      });
      return { ok: res.status === 200, status: res.status, detail: describeHttp(res.status) };
    }

    return { ok: true, status: null, detail: 'no credential file needed' };
  } catch (err) {
    const detail = err.name === 'TimeoutError' ? `no response in ${timeoutMs / 1000}s` : err.message;
    return { ok: false, status: null, detail };
  }
}

function describeHttp(status) {
  if (status === 200) return 'authenticated';
  if (status === 401) return 'credentials rejected (401)';
  if (status === 403) return 'authenticated but lacking permission (403)';
  if (status === 404) return 'endpoint not found (404) -- check the base URL';
  if (status >= 500) return `server error (${status})`;
  return `unexpected status ${status}`;
}
