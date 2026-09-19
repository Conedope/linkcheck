const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;

function findClosingBracket(s, open) {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (c === '\\') {
      i++;
      continue;
    }
    if (c === '[') {
      depth++;
    } else if (c === ']') {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}

function findClosingParen(s, open) {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (c === '\\') {
      i++;
      continue;
    }
    if (c === '(') {
      depth++;
    } else if (c === ')') {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}

function cleanTarget(raw) {
  let t = raw.trim();
  if (t[0] === '<') {
    const end = t.indexOf('>');
    t = end === -1 ? t.slice(1) : t.slice(1, end);
    return t.trim();
  }
  return t.split(/\s+/)[0] || '';
}

function scanSection(seg, lineNo, sourceFile, out) {
  let i = 0;
  while (i < seg.length) {
    const c = seg[i];
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (c === '!') {
      if (seg[i + 1] !== '[') {
        i++;
        continue;
      }
      const close = findClosingBracket(seg, i + 1);
      if (close === -1) {
        i += 2;
        continue;
      }
      const text = seg.slice(i + 2, close);
      const nxt = seg[close + 1];
      if (nxt === '(') {
        const pClose = findClosingParen(seg, close + 1);
        if (pClose === -1) {
          i = close + 1;
          continue;
        }
        out.push({
          type: 'image',
          text,
          target: cleanTarget(seg.slice(close + 2, pClose)),
          line: lineNo,
          sourceFile,
        });
        i = pClose + 1;
      } else if (nxt === '[') {
        i = scanReference(seg, i + 1, close, text, lineNo, sourceFile, out, 'image');
      } else {
        i = close + 1;
      }
      continue;
    }
    if (c !== '[') {
      i++;
      continue;
    }
    const close = findClosingBracket(seg, i);
    if (close === -1) {
      i++;
      continue;
    }
    const text = seg.slice(i + 1, close);
    const nxt = seg[close + 1];
    if (nxt === '(') {
      const pClose = findClosingParen(seg, close + 1);
      if (pClose === -1) {
        i = close + 1;
        continue;
      }
      out.push({
        type: 'inline',
        text,
        target: cleanTarget(seg.slice(close + 2, pClose)),
        line: lineNo,
        sourceFile,
      });
      i = pClose + 1;
    } else if (nxt === '[') {
      i = scanReference(seg, i, close, text, lineNo, sourceFile, out, 'reference');
    } else {
      i = close + 1;
    }
  }
}

function scanReference(seg, openIdx, closeIdx, text, lineNo, sourceFile, out, type) {
  if (seg[closeIdx + 2] === ']') {
    out.push({
      type,
      text,
      ref: text,
      target: undefined,
      line: lineNo,
      sourceFile,
    });
    return closeIdx + 3;
  }
  const rClose = findClosingBracket(seg, closeIdx + 1);
  if (rClose === -1) {
    return closeIdx + 1;
  }
  out.push({
    type,
    text,
    ref: seg.slice(closeIdx + 2, rClose),
    target: undefined,
    line: lineNo,
    sourceFile,
  });
  return rClose + 1;
}

function normalizeRefKey(name) {
  return String(name).trim().toLowerCase().replace(/\s+/g, ' ');
}

function isClosingFence(line, state) {
  const m = line.match(/^ {0,3}(`{3,}|~{3,})/);
  if (!m) {
    return false;
  }
  if (m[1][0] !== state.fenceChar || m[1].length < state.fenceLen) {
    return false;
  }
  return /^[ \t]*$/.test(line.slice(m.index + m[0].length));
}

export function extractLinks(text, sourceFile) {
  const lines = String(text).split(/\r?\n/);
  const state = { fenceChar: null, fenceLen: 0, commentOpen: false };
  const defs = new Map();
  const usages = [];

  for (let lineNo = 0; lineNo < lines.length; lineNo++) {
    const line = lines[lineNo];

    if (state.fenceChar) {
      if (isClosingFence(line, state)) {
        state.fenceChar = null;
        state.fenceLen = 0;
      }
      continue;
    }

    if (FENCE_RE.test(line)) {
      const m = FENCE_RE.exec(line);
      state.fenceChar = m[1][0];
      state.fenceLen = m[1].length;
      continue;
    }

    const indent = line.match(/^(\t|[ \t]{4})/);
    if (indent) {
      continue;
    }

    if (!state.commentOpen) {
      const def = line.match(/^ {0,3}\[([^\]]*)\]:\s*(.*)$/);
      if (def) {
        const target = cleanTarget(def[2]);
        if (target) {
          defs.set(normalizeRefKey(def[1]), { target, line: lineNo + 1 });
        }
        continue;
      }
    }

    const segments = nonCommentSegments(line, state);
    for (const seg of segments) {
      scanSection(seg, lineNo + 1, sourceFile, usages);
    }
  }

  for (const u of usages) {
    if (typeof u.target === 'string') {
      continue;
    }
    const hit = defs.get(normalizeRefKey(u.ref));
    if (hit) {
      u.target = hit.target;
    }
  }

  return usages;
}

function nonCommentSegments(line, state) {
  const segments = [];
  let i = 0;
  if (state.commentOpen) {
    const end = line.indexOf('-->');
    if (end === -1) {
      return segments;
    }
    state.commentOpen = false;
    i = end + 3;
  }
  for (;;) {
    const start = i;
    const openIdx = line.indexOf('<!--', i);
    if (openIdx === -1) {
      segments.push(line.slice(start));
      break;
    }
    if (openIdx > start) {
      segments.push(line.slice(start, openIdx));
    }
    const end = line.indexOf('-->', openIdx + 4);
    if (end === -1) {
      state.commentOpen = true;
      break;
    }
    i = end + 3;
  }
  return segments;
}