import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { makeTree } from './helpers.js';
import { resolveLink } from '../lib/resolve.js';

function link(file, target, type = 'inline', extra = {}) {
  return { type, text: 'x', target, line: 1, sourceFile: path.join(file), ...extra };
}

test('inline link to an existing file is ok', () => {
  const root = makeTree({ 'docs/readme.md': 'hi', 'guide.md': 'yes' });
  const res = resolveLink(link(path.join(root, 'docs', 'readme.md'), '../guide.md'));
  assert.equal(res.status, 'ok', JSON.stringify(res));
  assert.equal(res.reason, 'found');
});

test('inline link to a missing file is missing', () => {
  const root = makeTree({ 'docs/readme.md': 'hi' });
  const res = resolveLink(link(path.join(root, 'docs', 'readme.md'), 'ghost.md'));
  assert.equal(res.status, 'missing', JSON.stringify(res));
  assert.match(res.reason, /not found/);
});

test('image target verified like any other', () => {
  const root = makeTree({ 'a.md': '', 'img/logo.png': 'x' });
  const good = resolveLink(link(path.join(root, 'a.md'), 'img/logo.png', 'image'));
  assert.equal(good.status, 'ok');
  const bad = resolveLink(link(path.join(root, 'a.md'), 'img/gone.png', 'image'));
  assert.equal(bad.status, 'missing');
});

test('external links are external, never checked on disk', () => {
  const root = makeTree({ 'a.md': '' });
  for (const target of ['https://example.com/x.md', 'http://e.test', 'ftp://f.test/y', 'mailto:a@b.c', '//cdn.example.com/x']) {
    const res = resolveLink(link(path.join(root, 'a.md'), target));
    assert.equal(res.status, 'external', target);
    assert.equal(res.reason, 'external, skipped');
  }
});

test('../ traversal works both directions', () => {
  const root = makeTree({
    'docs/readme.md': '',
    'top.md': '',
    'docs/sub/deep.md': '',
  });
  const ok = resolveLink(link(path.join(root, 'docs', 'sub', 'deep.md'), '../../top.md'));
  assert.equal(ok.status, 'ok', JSON.stringify(ok));
  const missing = resolveLink(link(path.join(root, 'docs', 'sub', 'deep.md'), '../../../nope.md'));
  assert.equal(missing.status, 'missing', JSON.stringify(missing));
});

test('directory targets: existing dir ok, missing dir missing', () => {
  const root = makeTree({ 'a.md': '', 'docs/sub/': '' });
  const ok = resolveLink(link(path.join(root, 'a.md'), 'docs'));
  assert.equal(ok.status, 'ok', JSON.stringify(ok));
  assert.equal(ok.reason, 'directory exists');
  const bad = resolveLink(link(path.join(root, 'a.md'), 'nothere'));
  assert.equal(bad.status, 'missing', JSON.stringify(bad));
});

test('percent-encoded targets are decoded before checking', () => {
  const root = makeTree({ 'a.md': '', 'my file.md': 'x' });
  const res = resolveLink(link(path.join(root, 'a.md'), 'my%20file.md'));
  assert.equal(res.status, 'ok', JSON.stringify(res));
});

test('absolute paths are resolved from the filesystem root', () => {
  const root = makeTree({ 'a.md': '', 'abs.md': '' });
  const res = resolveLink(link(path.join(root, 'a.md'), '/tmp'));
  assert.equal(res.status, 'ok', JSON.stringify(res));
  assert.equal(res.reason, 'directory exists');
});

test('case-mismatched target resolves ok with note=case', () => {
  const root = makeTree({ 'Readme.md': 'x', 'a.md': '' });
  const res = resolveLink(link(path.join(root, 'a.md'), 'readme.md'));
  assert.equal(res.status, 'ok', JSON.stringify(res));
  assert.equal(res.note, 'case', JSON.stringify(res));
  assert.equal(res.reason.includes('Readme.md'), true);
});

test('case-mismatch across nested directories', () => {
  const root = makeTree({ 'Docs/Sub/Page.md': 'x', 'a.md': '' });
  const res = resolveLink(link(path.join(root, 'a.md'), 'docs/sub/page.md'));
  assert.equal(res.status, 'ok', JSON.stringify(res));
  assert.equal(res.note, 'case');
});

test('a genuinely missing file stays missing even after case fallback', () => {
  const root = makeTree({ 'NE.md': '', 'a.md': '' });
  const res = resolveLink(link(path.join(root, 'a.md'), 'nonecase.md'));
  assert.equal(res.status, 'missing', JSON.stringify(res));
});

test('a missing directory stays missing', () => {
  const root = makeTree({ 'a.md': '', 'NE.md': '' });
  const res = resolveLink(link(path.join(root, 'a.md'), 'nonecase'));
  assert.equal(res.status, 'missing', JSON.stringify(res));
});

test('anchor-only and self links are ok, anchor not verified', () => {
  const root = makeTree({ 'a.md': 'x' });
  const res = resolveLink(link(path.join(root, 'a.md'), '#section'));
  assert.equal(res.status, 'ok', JSON.stringify(res));
  assert.equal(res.anchor, 'section');
});

test('anchors on path targets are stripped but reported', () => {
  const root = makeTree({ 'a.md': '', 'b.md': 'x' });
  const res = resolveLink(link(path.join(root, 'a.md'), 'b.md#cool-part'));
  assert.equal(res.status, 'ok', JSON.stringify(res));
  assert.equal(res.anchor, 'cool-part');
});

test('dangling references are reported as missing', () => {
  const res = resolveLink(link('/proj/a.md', undefined, 'reference', { ref: 'nope' }));
  assert.equal(res.status, 'missing');
  assert.match(res.reason, /dangling reference/);
  assert.equal(res.note, 'reference');
});

test('cannot-stat errors are reported as error', () => {
  const root = makeTree({ 'a.md': '' });
  const res = resolveLink(link(path.join(root, 'a.md'), 'b.md'), {});
  assert.equal(res.status, 'missing');
});