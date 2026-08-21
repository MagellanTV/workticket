// Resolving the pull-request template.
//
// Two sources, in GitHub's own order of precedence:
//   1. a template committed in the repo -- an explicit, repo-specific override
//   2. the organisation default, fetched from a URL
//
// The remote one is fetched at setup time and cached into the project's data
// directory rather than fetched when the PR is created. Phase 11 runs at the end
// of a long workflow, and having it fail there because a network blipped -- or
// silently produce a PR with no template -- is worse than resolving this up
// front where a failure is cheap and visible.

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

/**
 * Where the org default lives. A blob URL is what a person copies from the
 * browser; only the raw host serves file contents, so accept either and
 * normalise.
 */
export const DEFAULT_TEMPLATE_URL =
  'https://raw.githubusercontent.com/MagellanTV/.github/main/PULL_REQUEST_TEMPLATE.md';

/** Filename the fetched template is cached under, inside .claude/workticket/. */
export const CACHE_FILENAME = 'pr-template.md';

/** github.com/o/r/blob/ref/path -> raw.githubusercontent.com/o/r/ref/path */
export function toRawUrl(url) {
  if (!url) return url;
  const m = String(url).match(
    /^https?:\/\/(?:www\.)?github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/,
  );
  return m ? `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}` : String(url);
}

/**
 * Fetch the template. Returns { ok, content, url, status, error }.
 * Never throws: a template is a nice-to-have, not a reason to abort setup.
 */
export async function fetchTemplate(url = DEFAULT_TEMPLATE_URL, { timeoutMs = 15000 } = {}) {
  const raw = toRawUrl(url);
  try {
    const res = await fetch(raw, { signal: AbortSignal.timeout(timeoutMs), redirect: 'follow' });
    if (!res.ok) {
      return {
        ok: false,
        url: raw,
        status: res.status,
        error:
          res.status === 404
            ? 'not found -- check the URL, or whether the repository is private'
            : `server returned ${res.status}`,
      };
    }
    const content = await res.text();
    if (!content.trim()) return { ok: false, url: raw, status: 200, error: 'the file is empty' };
    return { ok: true, content, url: raw, status: 200 };
  } catch (err) {
    const error =
      err.name === 'TimeoutError'
        ? `no response in ${timeoutMs / 1000}s`
        : /fetch failed/i.test(err.message)
          ? 'could not reach the host (offline?)'
          : err.message;
    return { ok: false, url: raw, status: null, error };
  }
}

/** Write the fetched template into the project's data directory. */
export function cacheTemplate(dataDir, content) {
  const file = join(dataDir, CACHE_FILENAME);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content, 'utf8');
  return file;
}

/**
 * Decide which template a project should use, without touching the network.
 * Returns { source, path } where source is 'repo' | 'cache' | 'none'.
 * A committed template wins, matching how GitHub itself resolves a repo
 * template over its organisation default.
 */
export function resolve(repoRoot, dataDir, repoTemplatePath) {
  if (repoTemplatePath && existsSync(join(repoRoot, repoTemplatePath))) {
    return { source: 'repo', path: repoTemplatePath };
  }
  const cached = join(dataDir, CACHE_FILENAME);
  if (existsSync(cached)) {
    // Store it repo-relative so config.md stays portable across machines.
    return { source: 'cache', path: `.claude/workticket/${CACHE_FILENAME}` };
  }
  return { source: 'none', path: '' };
}

/**
 * The org template ships filled in with an example (a "My List" screen, ticket
 * VRT-1234) rather than blank placeholders. Phase 11 has to replace that prose,
 * not tick it -- so report the headings, which are the part that is actually
 * structural.
 */
export function sections(content) {
  return String(content ?? '')
    .split('\n')
    .filter((l) => /^##\s+/.test(l))
    .map((l) => l.replace(/^##\s+/, '').trim());
}
