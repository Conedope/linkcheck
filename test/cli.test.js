import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { makeTree, runCli } from './helpers.js';

test('exit 0 for a tree with all-valid links', () => {
  const root = makeTree({
    'good.md': 'hi',
    'index.md': '[ok](good.md) and ![img](good.md)',
  });
  const res = runCli([root]);
  assert.equal(res.code, 0, res.stderr || res.stdout);
  assert.match(res.stdout, /2 links, 2 ok, 0 broken, 0 external/);
});

test('exit 1 on broken link with correct file:line and exit 1 for dirty extra', () => {
  const root = makeTree({
    'a.md': 'x',
    'index.md': ['line one', 'line two broken [b](missing.md)', 'fine [a](a.md)'].join('\n'),
  });
  const res = runCli([root]);
  assert.equal(res.code, 1);
  assert.match(res.stdout, /index\.md:2 missing\.md -> not found: missing\.md/);
  assert.match(res.stdout, /2 links, 1 ok, 1 broken, 0 external/);
});

test('missing image reported like a broken link', () => {
  const root = makeTree({ 'index.md': '![logo](img/logo.png)' });
  const res = runCli([root]);
  assert.equal(res.code, 1);
  assert.match(res.stdout, /index\.md:1 img\/logo\.png -> not found: img\/logo\.png/);
});

test('fenced and indented code links ignored end-to-end', () => {
  const root = makeTree({
    'ok.md': 'x',
    'index.md': [
      '[real](ok.md)',
      '```',
      '[fenced](missing1.md)',
      '```',
      '    [indented](missing2.md)',
      '',
    ].join('\n'),
  });
  const res = runCli([root]);
  assert.equal(res.code, 0, res.stdout);
  assert.match(res.stdout, /1 links, 1 ok, 0 broken, 0 external/);
});

test('HTML comment links ignored end-to-end', () => {
  const root = makeTree({
    'ok.md': 'x',
    'index.md': '<!-- [hidden](missing.md) --> [real](ok.md)',
  });
  const res = runCli([root]);
  assert.equal(res.code, 0, res.stdout);
  assert.match(res.stdout, /1 links, 1 ok, 0 broken, 0 external/);
});

test('external links skipped by default, fail under --strict-external', () => {
  const root = makeTree({ 'index.md': '[ext](https://example.com/doc.md)' });
  const loose = runCli([root]);
  assert.equal(loose.code, 0, loose.stdout);
  assert.match(loose.stdout, /1 links, 0 ok, 0 broken, 1 external \(skipped\)/);

  const strict = runCli([root, '--strict-external']);
  assert.equal(strict.code, 1, strict.stdout);
  assert.match(strict.stdout, /https:\/\/example\.com\/doc\.md -> external, skipped/);
  assert.match(strict.stdout, /1 links, 0 ok, 1 broken, 0 external \(skipped\)/);
});

test('reference links registered (ok) and dangling (broken)', () => {
  const root = makeTree({
    'target.md': 'x',
    'index.md': [
      '[full][manual]',
      '[ok][short]',
      '[broken][nope]',
      '',
      '[manual]: target.md',
      '[short]: []',
      '',
    ].join('\n'),
  });
  const res = runCli([root]);
  assert.equal(res.code, 1);
  assert.match(res.stdout, /dangling reference \[broken\]\[nope\] has no definition/);
  assert.match(res.stdout, /index\.md:3 .*-> dangling reference/);
});

test('../ traversal and directory links in CLI', () => {
  const root = makeTree({
    'docs/page.md': '',
    'sub/index.md': '[up](../docs/page.md) [dir](..) [gone](../gone.md)',
  });
  const res = runCli([root]);
  assert.equal(res.code, 1, res.stdout);
  assert.match(res.stdout, /sub\/index\.md:1 \.\.\/gone\.md -> not found:/);
  assert.match(res.stdout, /3 links, 2 ok, 1 broken, 0 external/);
});

test('percent-encoded target resolves', () => {
  const root = makeTree({ 'index.md': '[spaced](my%20file.md)', 'my file.md': 'x' });
  const res = runCli([root]);
  assert.equal(res.code, 0, res.stdout);
});

test('case-mismatch: ok with note, truly-missing still broken', () => {
  const root = makeTree({
    'index.md': ['[ci](readme.md)', '[gone](nonecase.md)'].join('\n'),
    'Readme.md': 'x',
  });
  const res = runCli([root, '--json']);
  assert.equal(res.code, 1);
  const results = JSON.parse(res.stdout);
  const ci = results.find((r) => r.text === 'ci');
  assert.equal(ci.status, 'ok');
  assert.equal(ci.note, 'case');
  const gone = results.find((r) => r.text === 'gone');
  assert.equal(gone.status, 'missing');
});

test('--json outputs machine-readable array with all fields', () => {
  const root = makeTree({
    'ok.md': 'x',
    'index.md': '[ok](ok.md) [bad](ghost.md) [ext](https://e.test/) ![img](ok.md)',
  });
  const res = runCli([root, '--json']);
  assert.equal(res.code, 1);
  const results = JSON.parse(res.stdout);
  assert.equal(results.length, 4);
  const ok = results.find((r) => r.text === 'ok');
  assert.deepEqual(
    { status: ok.status, type: ok.type, target: ok.target, line: ok.line },
    { status: 'ok', type: 'inline', target: 'ok.md', line: 1 }
  );
  const bad = results.find((r) => r.text === 'bad');
  assert.deepEqual(
    { status: bad.status, reason: bad.reason },
    { status: 'missing', reason: 'not found: ghost.md' }
  );
  const ext = results.find((r) => r.status === 'external');
  assert.equal(ext.reason, 'external, skipped');
  for (const r of results) {
    assert.equal(typeof r.sourceFile, 'string');
    assert.equal(typeof r.line, 'number');
  }
});

test('multiple files including subdirectories', () => {
  const root = makeTree({
    'a.md': '[good](b.md) [bad](gone.md)',
    'b.md': 'x',
    'docs/c.md': '[sibling](missing.md)',
  });
  const res = runCli([root]);
  assert.equal(res.code, 1);
  assert.match(res.stdout, /a\.md:1 gone\.md ->/);
  assert.match(res.stdout, /docs\/c\.md:1 missing\.md ->/);
  assert.match(res.stdout, /3 links, 1 ok, 2 broken, 0 external/);
});

test('exit 2 on missing path argument', () => {
  const root = makeTree({});
  const res = runCli([path.join(root, 'does-not-exist')]);
  assert.equal(res.code, 2);
  assert.match(res.stderr, /cannot access/);
});

test('exit 2 on no arguments', () => {
  const res = runCli([]);
  assert.equal(res.code, 2);
  assert.match(res.stderr, /no paths given/);
});

test('exit 2 on unknown option', () => {
  const res = runCli(['--bogus']);
  assert.equal(res.code, 2);
  assert.match(res.stderr, /unknown option: --bogus/);
});

test('--files accepts multiple explicit files', () => {
  const root = makeTree({
    'a.md': '[bad](gone.md)',
    'b.md': '[ok](a.md)',
  });
  const res = runCli(['--files', 'a.md', 'b.md'], { cwd: root });
  assert.equal(res.code, 1, res.stdout);
  assert.match(res.stdout, /a\.md:1 gone\.md ->/);
});

test('--version and --help exit 0', () => {
  const v = runCli(['--version']);
  assert.equal(v.code, 0);
  assert.match(v.stdout, /^linkcheck \d+\.\d+\.\d+/);

  const h = runCli(['--help']);
  assert.equal(h.code, 0);
  assert.match(h.stdout, /linkcheck — offline Markdown local link checker/);
});

test('--no-color strips ANSI escapes', () => {
  const root = makeTree({ 'index.md': '[bad](gone.md)' });
  const plain = runCli([root, '--no-color']);
  assert.equal(plain.code, 1);
  assert.equal(plain.stdout.includes('\u001b['), false);
});

test('positional file argument works like a directory', () => {
  const root = makeTree({ 'index.md': '[bad](gone.md)' });
  const res = runCli([path.join(root, 'index.md')]);
  assert.equal(res.code, 1);
  assert.match(res.stdout, /index\.md:1 gone\.md ->/);
});