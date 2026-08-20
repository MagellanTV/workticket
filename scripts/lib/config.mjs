// Reading and writing .claude/workticket/config.md.
//
// The config is markdown with fenced yaml blocks, one per section. That format
// exists so the file stays readable and every field keeps its explanatory
// comment -- so writing to it is a targeted line edit, not a serialize of a
// parsed object. Round-tripping through a YAML dumper would strip every comment
// and reorder the file, which is why this module edits text in place.
//
// The parser handles the subset the template actually uses: scalars, one level
// of nesting, inline [] and {}, and `- item` lists. Anything more exotic is a
// sign the template drifted and should be caught by a test, not silently half-read.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

/** Section heading in config.md -> key used by SKILL.md (`project.base_branch`). */
export const SECTIONS = {
  Project: 'project',
  'Branch naming': 'branch_naming',
  'Ticket system': 'ticket_system',
  'Code review skill': 'code_review',
  'Linter / static analysis': 'linter',
  'Build & test': 'build_test',
  'PR template': 'pr_template',
  'Knowledge base': 'knowledge',
  Changelog: 'changelog',
  'Git preferences': 'git',
};

const stripComment = (s) => {
  // Only strip a # that starts a comment, not one inside a quoted value.
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "'" && !inDouble) inSingle = !inSingle;
    else if (c === '"' && !inSingle) inDouble = !inDouble;
    else if (c === '#' && !inSingle && !inDouble) return s.slice(0, i);
  }
  return s;
};

const unquote = (s) => {
  const t = s.trim();
  if (t.length > 1 && ((t[0] === '"' && t.at(-1) === '"') || (t[0] === "'" && t.at(-1) === "'"))) {
    return t.slice(1, -1);
  }
  return t;
};

function coerce(raw) {
  const v = unquote(stripComment(raw));
  if (v === '') return '';
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === '[]') return [];
  if (v === '{}') return ({});
  if (v === 'null' || v === '~') return null;
  if (/^-?\d+$/.test(v)) return Number(v);
  // Inline flow sequence: ["bug", "defect"] -- the template uses these for
  // labels_mapping, so leaving them as a raw string would misreport the config.
  if (v.startsWith('[') && v.endsWith(']')) return splitFlow(v.slice(1, -1)).map(unquote);
  return v;
}

/** Split a flow sequence body on commas that are not inside quotes. */
function splitFlow(body) {
  const parts = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;
  for (const c of body) {
    if (c === "'" && !inDouble) inSingle = !inSingle;
    else if (c === '"' && !inSingle) inDouble = !inDouble;
    if (c === ',' && !inSingle && !inDouble) {
      parts.push(current);
      current = '';
      continue;
    }
    current += c;
  }
  if (current.trim()) parts.push(current);
  return parts.map((p) => p.trim()).filter(Boolean);
}

/**
 * Pull the fenced yaml blocks out of the markdown, keyed by section heading.
 *
 * Prose is allowed between a heading and its fence -- sections carry
 * explanatory text, and requiring the fence to sit immediately under the
 * heading made a one-line doc addition silently drop the whole section. The
 * `(?!^## )` guard stops a section without a fence from swallowing the next
 * section's block.
 */
export function extractBlocks(markdown) {
  const blocks = {};
  const re = /^##\s+(.+?)\s*$(?:(?!^##\s)[\s\S])*?^```ya?ml\n([\s\S]*?)^```/gm;
  let m;
  while ((m = re.exec(markdown)) !== null) blocks[m[1].trim()] = m[2];
  return blocks;
}

/** Parse one yaml block into an object. */
export function parseBlock(text) {
  const out = {};
  const lines = text.split('\n');
  let parentKey = null;
  let parentIndent = 0;
  let listKey = null;
  // Keys written as a bare `key:` -- if nothing follows they are empty lists,
  // whereas an explicit `key: {}` is an empty map and must stay one.
  const openedBare = new Set();

  for (const raw of lines) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    const indent = raw.length - raw.trimStart().length;
    const line = raw.trim();

    // `- item` continues the list opened by the previous `key:`
    if (line.startsWith('- ')) {
      if (listKey) {
        const target = listKey.parent ? (out[listKey.parent] ??= {}) : out;
        const existing = target[listKey.key];
        // The key was opened as a bare `key:` and placeholder-set to {}; now that
        // a `- item` follows we know it is a list.
        if (!Array.isArray(existing)) target[listKey.key] = [];
        target[listKey.key].push(coerce(line.slice(2)));
      }
      continue;
    }

    const m = line.match(/^([A-Za-z0-9_.\-"']+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = unquote(m[1]);
    const rest = m[2];

    if (parentKey !== null && indent <= parentIndent) parentKey = null;

    if (stripComment(rest).trim() === '') {
      // Either a nested map or the head of a `- item` list; decided by what follows.
      if (parentKey === null) {
        parentKey = key;
        parentIndent = indent;
        listKey = { parent: null, key };
        openedBare.add(key);
        out[key] ??= {};
      } else {
        listKey = { parent: parentKey, key };
        (out[parentKey] ??= {})[key] ??= {};
      }
      continue;
    }

    listKey = null;
    const value = coerce(rest);
    if (parentKey !== null && indent > parentIndent) {
      (out[parentKey] ??= {})[key] = value;
    } else {
      parentKey = null;
      out[key] = value;
    }
  }

  // A key opened bare and never filled is an empty list, not an empty map.
  for (const k of openedBare) {
    const v = out[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0) out[k] = [];
  }
  return out;
}

/** Parse a whole config.md into { project: {...}, linter: {...}, ... }. */
export function parseConfig(markdown) {
  const blocks = extractBlocks(markdown);
  const config = {};
  for (const [heading, body] of Object.entries(blocks)) {
    const key = SECTIONS[heading] ?? heading.toLowerCase().replace(/\W+/g, '_');
    config[key] = parseBlock(body);
  }
  return config;
}

export function readConfig(file) {
  if (!existsSync(file)) return null;
  return parseConfig(readFileSync(file, 'utf8'));
}

const yamlScalar = (value) => {
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return '[]';
  return `"${String(value ?? '').replace(/"/g, '\\"')}"`;
};

/**
 * Replace one scalar inside a section's yaml block, keeping the inline comment
 * and the surrounding indentation. Returns the markdown unchanged when the key
 * is absent, so a template that drifted cannot silently lose a value.
 */
export function setValue(markdown, sectionHeading, key, value) {
  // Same tolerance as extractBlocks: prose may sit between heading and fence.
  const re = new RegExp(
    `(^##\\s+${escapeRe(sectionHeading)}\\s*$(?:(?!^##\\s)[\\s\\S])*?^\`\`\`ya?ml\\n)([\\s\\S]*?)(^\`\`\`)`,
    'm',
  );
  const match = markdown.match(re);
  if (!match) return { text: markdown, applied: false, reason: `section "${sectionHeading}" not found` };

  const [, head, body, tail] = match;
  const keyRe = new RegExp(`^(\\s*${escapeRe(key)}\\s*:\\s*)([^\\n#]*)(\\s*#.*)?$`, 'm');
  if (!keyRe.test(body)) {
    return { text: markdown, applied: false, reason: `key "${key}" not found in "${sectionHeading}"` };
  }

  const nextBody = body.replace(keyRe, (_all, prefix, _old, comment) => {
    const rendered = yamlScalar(value);
    if (!comment) return `${prefix}${rendered}`;
    // Keep the comment in the template's column (32) when the value is short
    // enough, otherwise one space -- never overlapping the value.
    const target = Math.max(prefix.length + rendered.length + 1, 32);
    const pad = ' '.repeat(Math.max(1, target - prefix.length - rendered.length));
    return `${prefix}${rendered}${pad}${comment.trim()}`;
  });

  // Function replacer, not a string: in a replacement string `$&`, `$\``, `$'`
  // and `$1` are substitution patterns, and the template legitimately contains
  // `$'` inside a style_checks example. A string here corrupts the file.
  return { text: markdown.replace(re, () => `${head}${nextBody}${tail}`), applied: true, reason: null };
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Apply a list of {section, key, value} edits. Reports which ones missed. */
export function applyEdits(markdown, edits) {
  let text = markdown;
  const applied = [];
  const missed = [];
  for (const edit of edits) {
    if (edit.value === undefined || edit.value === null || edit.value === '') continue;
    const res = setValue(text, edit.section, edit.key, edit.value);
    text = res.text;
    (res.applied ? applied : missed).push(edit);
  }
  return { text, applied, missed };
}

/** Turn detectProject() output plus answers into config.md edits. */
export function editsFromDetection({ detected, projectName, baseBranch, provider, baseUrl, graphifyEnabled }) {
  return [
    { section: 'Project', key: 'name', value: projectName || detected.name },
    { section: 'Project', key: 'language', value: detected.language },
    { section: 'Project', key: 'base_branch', value: baseBranch },
    { section: 'Ticket system', key: 'provider', value: provider },
    { section: 'Ticket system', key: 'base_url', value: baseUrl },
    { section: 'Linter / static analysis', key: 'command', value: detected.linterCommand },
    { section: 'Linter / static analysis', key: 'fix_command', value: detected.linterFixCommand },
    { section: 'Build & test', key: 'test_command', value: detected.testCommand },
    { section: 'Build & test', key: 'test_type', value: detected.testType },
    { section: 'PR template', key: 'template_path', value: detected.prTemplate },
    { section: 'Changelog', key: 'version_source', value: detected.versionSource },
    { section: 'Knowledge base', key: 'graphify_enabled', value: graphifyEnabled },
  ];
}

export function writeConfig(file, markdown) {
  writeFileSync(file, markdown, 'utf8');
}
