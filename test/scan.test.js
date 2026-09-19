import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { makeTree } from './helpers.js';
import { collectFiles, isMarkdown } from '../lib/scan.js';

test('collectFiles walks directories recursively, only .md/.markdown', () => {
  const root = makeTree({
    'a.md': '',
    'b.markdown': '',
    'notes/x.md': '',
    'notes/deep/y.md': '',
    'notes/z.txt': '',
    'notes/node_modules/skip.md': '',
    '.git/also-skip.md': '',
  });
  const files = collectFiles([root], { cwd: process.cwd() });
  const rel = files.map((f) => path.relative(root, f)).sort();
  assert.deepEqual(rel, ['a.md', 'b.markdown', 'notes/deep/y.md', 'notes/x.md']);
});

test('explicit file argument returns just that file', () => {
  const root = makeTree({ 'a.md': '', 'sub/b.md': '' });
  const files = collectFiles([path.join(root, 'sub', 'b.md')]);
  assert.deepEqual(files, [path.join(root, 'sub', 'b.md')]);
});

test('explicit file argument ignores non-markdown files', () => {
  const root = makeTree({ 'a.txt': '' });
  const files = collectFiles([path.join(root, 'a.txt')]);
  assert.deepEqual(files, []);
});

test('missing path throws', () => {
  const root = makeTree({});
  assert.throws(() => collectFiles([path.join(root, 'nope', 'dir')]));
});

test('isMarkdown match rules', () => {
  assert.equal(isMarkdown('x.md'), true);
  assert.equal(isMarkdown('X.MARKDOWN'), true);
  assert.equal(isMarkdown('x.txt'), false);
  assert.equal(isMarkdown('x.mkd'), false);
});