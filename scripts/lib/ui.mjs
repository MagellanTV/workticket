// Terminal output and prompting. No dependencies: colour via raw ANSI,
// prompts via node:readline/promises. Colour is suppressed when stdout is
// not a TTY or NO_COLOR is set, so piped/CI output stays clean.

import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const useColor = Boolean(stdout.isTTY) && !process.env.NO_COLOR;
const wrap = (code) => (s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : String(s));

export const bold = wrap('1');
export const dim = wrap('2');
export const red = wrap('31');
export const green = wrap('32');
export const yellow = wrap('33');
export const blue = wrap('36');

export const OK = () => green('OK');
export const ERR = () => red('ERR');
export const WARN = () => yellow('WARN');
export const SKIP = () => dim('SKIP');

export function heading(text) {
  console.log('');
  console.log(bold(text));
  console.log(dim('-'.repeat(text.length)));
}

export const info = (msg) => console.log(`  ${msg}`);
export const step = (msg) => console.log(`  ${blue('>')} ${msg}`);
export const good = (msg) => console.log(`  ${green('+')} ${msg}`);
export const warn = (msg) => console.log(`  ${yellow('!')} ${msg}`);
export const fail = (msg) => console.log(`  ${red('x')} ${msg}`);
export const skipped = (msg) => console.log(`  ${dim('-')} ${dim(msg)}`);

/** Marker shown in dry-run mode so no line can be mistaken for a real write. */
export const planned = (msg) => console.log(`  ${yellow('~')} ${dim('[dry-run]')} ${msg}`);

/**
 * Render a fixed-width table. rows = array of arrays of strings.
 * Widths are computed on the *visible* length so ANSI codes do not skew them.
 */
export function table(headers, rows) {
  const visible = (s) => String(s ?? '').replace(/\x1b\[[0-9;]*m/g, '').length;
  const all = [headers, ...rows];
  const widths = headers.map((_, i) => Math.max(...all.map((r) => visible(r[i]))));
  const line = (r) =>
    '  ' +
    r
      .map((cell, i) => String(cell ?? '') + ' '.repeat(widths[i] - visible(cell)))
      .join('  ')
      .trimEnd();
  console.log(line(headers.map(bold)));
  console.log('  ' + widths.map((w) => dim('-'.repeat(w))).join('  '));
  rows.forEach((r) => console.log(line(r)));
}

/**
 * Raised when stdin closes while we are waiting for an answer -- Ctrl+D, or the
 * command run with stdin redirected. Callers treat it as "no input, wrote
 * nothing" rather than an internal failure, so the CLI can report it in one
 * clean line instead of readline's own message plus a stack-trace hint.
 */
export class InputClosedError extends Error {
  constructor(message = 'No input received -- stdin closed before the question was answered.') {
    super(message);
    this.name = 'InputClosedError';
    this.code = 'INPUT_CLOSED';
  }
}

let rl = null;
const getRl = () => (rl ??= createInterface({ input: stdin, output: stdout }));

/** readline rejects on EOF; turn that into our own typed error. */
async function question(prompt) {
  try {
    return await getRl().question(prompt);
  } catch {
    closePrompts();
    throw new InputClosedError();
  }
}

export function closePrompts() {
  rl?.close();
  rl = null;
}

/** Free-text question. Returns fallback when the answer is empty. */
export async function ask(q, fallback = '') {
  if (!stdin.isTTY) return fallback;
  const suffix = fallback ? ` ${dim(`[${fallback}]`)}` : '';
  const answer = (await question(`  ${q}${suffix} `)).trim();
  return answer || fallback;
}

/** Yes/no question. */
export async function confirm(q, fallback = true) {
  if (!stdin.isTTY) return fallback;
  const hint = fallback ? 'Y/n' : 'y/N';
  for (;;) {
    const a = (await question(`  ${q} ${dim(`[${hint}]`)} `)).trim().toLowerCase();
    if (!a) return fallback;
    if (['y', 'yes'].includes(a)) return true;
    if (['n', 'no'].includes(a)) return false;
    console.log(`  ${dim('Please answer y or n.')}`);
  }
}

/** Pick one of a list. Returns the chosen value, or fallback non-interactively. */
export async function choose(q, options, fallback = null) {
  if (!stdin.isTTY || options.length === 0) return fallback;
  console.log(`  ${q}`);
  options.forEach((o, i) => console.log(`    ${bold(String(i + 1))}) ${o}`));
  for (;;) {
    const a = (await question(`  ${dim(`1-${options.length}`)} `)).trim();
    if (!a && fallback !== null) return fallback;
    const n = Number(a);
    if (Number.isInteger(n) && n >= 1 && n <= options.length) return options[n - 1];
    console.log(`  ${dim(`Enter a number between 1 and ${options.length}.`)}`);
  }
}

const CTRL_C = '\x03';
const BACKSPACE = '\x7f';

/**
 * Read a secret without echoing it. The value goes straight from the user's
 * terminal into the file we write -- it is never printed, logged, or passed
 * as a command-line argument where it could land in shell history or ps output.
 */
export async function askSecret(q) {
  if (!stdin.isTTY) return '';
  closePrompts();
  return new Promise((resolve, reject) => {
    stdout.write(`  ${q} `);
    const wasRaw = Boolean(stdin.isRaw);
    stdin.setRawMode?.(true);
    stdin.resume();
    let value = '';
    const done = (result) => {
      stdin.removeListener('data', onData);
      stdin.removeListener('end', onEnd);
      stdin.setRawMode?.(wasRaw);
      stdin.pause();
      stdout.write('\n');
      resolve(result);
    };
    const onEnd = () => {
      stdin.removeListener('data', onData);
      stdin.setRawMode?.(wasRaw);
      stdout.write('\n');
      reject(new InputClosedError());
    };
    const onData = (chunk) => {
      for (const ch of chunk.toString('utf8')) {
        if (ch === '\r' || ch === '\n') return done(value);
        if (ch === CTRL_C) {
          done('');
          process.exit(130);
          return;
        }
        if (ch === BACKSPACE || ch === '\b') {
          if (value.length) {
            value = value.slice(0, -1);
            stdout.write('\b \b');
          }
          continue;
        }
        value += ch;
        stdout.write('*');
      }
    };
    stdin.on('data', onData);
    stdin.once('end', onEnd);
  });
}
