#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { collectFiles } from '../lib/scan.js';
import { extractLinks } from '../lib/extract.js';
import { resolveLink } from '../lib/resolve.js';

const USAGE = `linkcheck — offline Markdown local link checker (no npm dependencies)

Usage:
  linkcheck [PATH...] [options]
  linkcheck --files MARKDOWN.md [MORE.md...]

Arguments:
  PATH                 file or directory to scan (.md / .markdown)

Options:
  --files PATH...      explicit Markdown files to check
  --strict-external    treat external (http/https/ftp) links as failures
  --json               emit a JSON array of per-link results on stdout
  --no-color           disable ANSI colors
  --version, -v        print the version and exit
  --help, -h           show this help and exit

Exit codes:
  0  no broken links found (external links are skipped)
  1  one or more broken links (or external links under --strict-external)
  2  usage error or I/O error

Notes:
  - Only local filesystem targets are verified. External URLs are reported
    as "external, skipped" unless --strict-external is given.
  - Links inside fenced or indented code blocks, and inside HTML comments,
    are ignored.
  - A link's "#anchor" fragment is not verified; anchors are reported but
    never checked against the file contents.
`;

const BOLD = '\u001b[1m';
const RED = '\u001b[31m';
const RESET = '\u001b[0m';

function readVersion() {
  try {
    const url = new URL('../package.json', import.meta.url);
    return JSON.parse(fs.readFileSync(url, 'utf8')).version || 'unknown';
  } catch {
    return 'unknown';
  }
}

function parseArgs(argv) {
  const files = [];
  const paths = [];
  let strictExternal = false;
  let json = false;
  let noColor = false;
  let help = false;
  let version = false;

  const isFlag = (a) => a.length > 1 && a.startsWith('-');
  let i = 0;
  while (i < argv.length) {
    const a = argv[i];
    if (a === '--files') {
      i++;
      while (i < argv.length && !isFlag(argv[i])) {
        files.push(argv[i]);
        i++;
      }
      continue;
    }
    switch (a) {
      case '--strict-external':
        strictExternal = true;
        break;
      case '--json':
        json = true;
        break;
      case '--no-color':
        noColor = true;
        break;
      case '--version':
      case '-v':
        version = true;
        break;
      case '--help':
      case '-h':
        help = true;
        break;
      case '-':
        paths.push(a);
        break;
      default:
        if (isFlag(a)) {
          return { error: `unknown option: ${a}` };
        }
        paths.push(a);
    }
    i++;
  }
  return { files, paths, strictExternal, json, noColor, help, version };
}

const BROKEN = new Set(['missing', 'error']);

export function run(argv, options = {}) {
  const cwd = options.cwd || process.cwd();
  const parsed = parseArgs(argv ?? []);

  if (parsed.error) {
    return { code: 2, out: '', err: `linkcheck: ${parsed.error}\n\n${USAGE}` };
  }
  if (parsed.help) {
    return { code: 0, out: USAGE, err: '' };
  }
  if (parsed.version) {
    return { code: 0, out: `linkcheck ${readVersion()}\n`, err: '' };
  }

  const tty = typeof process.stdout.isTTY === 'boolean' && process.stdout.isTTY;
  const useColor = (options.color !== undefined ? options.color : tty) && !parsed.noColor;

  const allPaths = [...parsed.files, ...parsed.paths];
  if (allPaths.length === 0) {
    return { code: 2, err: `linkcheck: no paths given\n\n${USAGE}` };
  }

  let files;
  try {
    files = collectFiles(allPaths, { cwd });
  } catch (e) {
    return { code: 2, out: '', err: `linkcheck: ${e.message}\n` };
  }

  const results = [];
  let ioError = false;
  for (const file of files) {
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch (e) {
      ioError = true;
      results.push({
        sourceFile: file,
        line: 0,
        type: 'error',
        text: '',
        target: null,
        status: 'error',
        reason: `cannot read: ${e.message}`,
        note: null,
      });
      continue;
    }
    for (const link of extractLinks(text, file)) {
      const res = resolveLink(link);
      results.push({
        sourceFile: file,
        line: link.line,
        type: link.type,
        text: link.text,
        target: link.target ?? null,
        anchor: res.anchor,
        status: res.status,
        reason: res.reason,
        note: res.note || null,
        found: res.found || null,
      });
    }
  }

  const brokenLines = [];
  let ok = 0;
  let broken = 0;
  let external = 0;
  for (const r of results) {
    if (r.status === 'ok') {
      ok++;
    } else if (r.status === 'external') {
      if (parsed.strictExternal) {
        broken++;
        brokenLines.push(r);
      } else {
        external++;
      }
    } else {
      broken++;
      brokenLines.push(r);
    }
  }

  if (ioError) {
    return { code: 2, out: '', err: `linkcheck: I/O error while reading files (see results)\n` };
  }

  const lines = [];
  if (parsed.json) {
    lines.push(JSON.stringify(results, null, 2));
  } else {
    for (const r of brokenLines) {
      const target = r.target ? `${r.target} ` : '';
      const note = r.note ? ` (${r.note}${r.found ? `: '${r.found}'` : ''})` : '';
      const msg = `${r.sourceFile}:${r.line} ${target}-> ${r.reason}${note}`;
      lines.push(useColor ? `${RED}${msg}${RESET}` : msg);
    }
    const summary = `${results.length} links, ${ok} ok, ${broken} broken, ${external} external (skipped)`;
    lines.push(useColor ? `${BOLD}${summary}${RESET}` : summary);
  }

  const code = broken > 0 ? 1 : 0;
  return { code, out: lines.join('\n') + '\n', err: '' };
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);

if (isMain) {
  const res = run(process.argv.slice(2));
  if (res.out) {
    process.stdout.write(res.out);
  }
  if (res.err) {
    process.stderr.write(res.err);
  }
  process.exitCode = res.code;
}