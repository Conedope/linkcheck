import fs from 'node:fs';
import path from 'node:path';

const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

function isExternal(target) {
  if (/^[a-z]:[\\/]/i.test(target)) {
    return false;
  }
  return SCHEME_RE.test(target) || target.startsWith('//');
}

function tryStat(p) {
  try {
    return fs.statSync(p);
  } catch (e) {
    if (e && e.code === 'ENOENT') {
      return null;
    }
    throw e;
  }
}

function caseInsensitiveResolve(abs) {
  const root = path.parse(abs).root;
  let parts = abs.slice(root.length).split(path.sep).filter(Boolean);
  let base = root || path.sep;
  for (const part of parts) {
    if (part === '.') {
      continue;
    }
    if (part === '..') {
      base = path.dirname(base);
      continue;
    }
    let entries;
    try {
      entries = fs.readdirSync(base);
    } catch {
      return null;
    }
    const hit = entries.find((e) => e.toLowerCase() === part.toLowerCase());
    if (!hit) {
      return null;
    }
    base = path.join(base, hit);
  }
  return base;
}

export function resolveLink(link) {
  const sourceFile = link.sourceFile;
  let raw = link.target;

  if (raw === undefined || raw === null) {
    return {
      status: 'missing',
      reason: `dangling reference [${link.text}][${link.ref ?? ''}] has no definition`,
      anchor: null,
      note: 'reference',
    };
  }

  raw = String(raw);
  if (isExternal(raw)) {
    return { status: 'external', reason: 'external, skipped', anchor: null };
  }

  let anchor = null;
  const hashIdx = raw.indexOf('#');
  if (hashIdx !== -1) {
    anchor = raw.slice(hashIdx + 1) || null;
    raw = raw.slice(0, hashIdx);
  }

  let decoded;
  try {
    decoded = decodeURI(raw);
  } catch {
    decoded = raw;
  }

  if (decoded === '' || decoded === '.') {
    return { status: 'ok', reason: 'self (anchor-only) link', anchor, note: 'anchor' };
  }

  const abs = decoded.startsWith('/')
    ? path.normalize(decoded)
    : path.resolve(path.dirname(sourceFile), decoded);

  let exact;
  try {
    exact = tryStat(abs);
  } catch (e) {
    return { status: 'error', reason: `cannot stat: ${e.message}`, anchor };
  }

  if (exact) {
    const isDir = exact.isDirectory();
    return {
      status: 'ok',
      reason: isDir ? 'directory exists' : 'found',
      anchor,
    };
  }

  const found = caseInsensitiveResolve(abs);
  if (found) {
    let st;
    try {
      st = tryStat(found);
    } catch (e) {
      return { status: 'error', reason: `cannot stat: ${e.message}`, anchor };
    }
    if (st) {
      return {
        status: 'ok',
        reason: `case-mismatch: found '${path.basename(found)}'`,
        anchor,
        note: 'case',
        found,
      };
    }
  }

  return {
    status: 'missing',
    reason: `not found: ${decoded}`,
    anchor,
  };
}