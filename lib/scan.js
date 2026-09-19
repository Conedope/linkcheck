import fs from 'node:fs';
import path from 'node:path';

const MD_RE = /\.(md|markdown)$/i;

export function isMarkdown(file) {
  return MD_RE.test(file);
}

function walk(dir, out, seen) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    throw new Error(`cannot read directory ${dir}: ${e.message}`);
  }
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const ent of entries) {
    if (ent.name === 'node_modules' || ent.name === '.git') {
      continue;
    }
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      walk(full, out, seen);
    } else if (ent.isFile() && isMarkdown(ent.name) && !seen.has(full)) {
      seen.add(full);
      out.push(full);
    }
  }
}

export function collectFiles(paths, options = {}) {
  const cwd = options.cwd || process.cwd();
  const out = [];
  const seen = new Set();

  for (const p of paths) {
    const abs = path.resolve(cwd, String(p));
    let st;
    try {
      st = fs.statSync(abs);
    } catch (e) {
      throw new Error(`cannot access ${p}: ${e.message}`);
    }
    if (st.isFile()) {
      if (isMarkdown(abs) && !seen.has(abs)) {
        seen.add(abs);
        out.push(abs);
      }
    } else if (st.isDirectory()) {
      walk(abs, out, seen);
    } else {
      throw new Error(`not a regular file or directory: ${p}`);
    }
  }

  out.sort();
  return out;
}