import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractLinks } from '../lib/extract.js';

test('inline links: text, target, line, type', () => {
  const src = [
    '# Title',
    '',
    'see [guide](guide.md) and [missing](../../gone.md).',
    '',
    '![logo](img/logo.png)',
    '',
  ].join('\n');
  const links = extractLinks(src, '/proj/readme.md');
  assert.equal(links.length, 3, 'three links extracted');

  const [guide, missing, logo] = links;
  assert.deepEqual(
    { type: guide.type, text: guide.text, target: guide.target, line: guide.line },
    { type: 'inline', text: 'guide', target: 'guide.md', line: 3 }
  );
  assert.deepEqual(
    { type: missing.type, text: missing.text, target: missing.target, line: missing.line },
    { type: 'inline', text: 'missing', target: '../../gone.md', line: 3 }
  );
  assert.deepEqual(
    { type: logo.type, text: logo.text, target: logo.target, line: logo.line },
    { type: 'image', text: 'logo', target: 'img/logo.png', line: 5 }
  );
  for (const l of links) {
    assert.equal(l.sourceFile, '/proj/readme.md');
  }
});

test('inline link with title and angle brackets is cleaned', () => {
  const src = '[a](docs/page.md "the page") [b](<angle targeted.md>)';
  const links = extractLinks(src, '/proj/r.md');
  assert.equal(links.length, 2);
  assert.equal(links[0].target, 'docs/page.md');
  assert.equal(links[1].target, 'angle targeted.md');
});

test('reference links are resolved against definitions', () => {
  const src = [
    'see [manual][MANUAL] and [docs][] and [dangling][nope]',
    '',
    '[MANUAL]: ./manual.md',
    '[docs]: guides/docs.md#section',
    '',
  ].join('\n');
  const links = extractLinks(src, '/proj/index.md');
  assert.equal(links.length, 3);

  const [manual, docs, dangling] = links;
  assert.equal(manual.type, 'reference');
  assert.equal(manual.text, 'manual');
  assert.equal(manual.target, './manual.md');
  assert.equal(manual.line, 1);

  assert.equal(docs.type, 'reference');
  assert.equal(docs.text, 'docs');
  assert.equal(docs.target, 'guides/docs.md#section');

  assert.equal(dangling.type, 'reference');
  assert.equal(dangling.text, 'dangling');
  assert.equal(dangling.target, undefined, 'dangling references keep undefined target');
  assert.equal(dangling.ref, 'nope');
});

test('reference definitions are case-insensitive and whitespace-collapsed', () => {
  const src = ['use [x][ my ref ]', '', '[MY   REF]: ./target.md'].join('\n');
  const links = extractLinks(src, '/proj/r.md');
  assert.equal(links.length, 1);
  assert.equal(links[0].target, './target.md');
});

test('image reference style', () => {
  const src = ['![pic][imgref]', '', '[imgref]: ./pic.png'].join('\n');
  const links = extractLinks(src, '/proj/r.md');
  assert.equal(links.length, 1);
  assert.equal(links[0].type, 'image');
  assert.equal(links[0].text, 'pic');
  assert.equal(links[0].target, './pic.png');
});

test('links inside fenced code blocks are ignored', () => {
  const src = [
    'real [ok](real.md)',
    '```',
    '[hidden](nothere.md)',
    'more [also hidden](gone.md)',
    '```',
    '```js',
    '[hidden in lang fence](gone2.md)',
    '```',
    'real [after](after.md)',
    '~~~',
    '[hidden tilde](gone3.md)',
    '~~~',
  ].join('\n');
  const links = extractLinks(src, '/proj/r.md');
  assert.deepEqual(links.map((l) => l.text), ['ok', 'after']);
});

test('links inside indented code blocks are ignored', () => {
  const src = [
    'real [ok](real.md)',
    '    [indented](gone.md)',
    '\t[tab indented](gone2.md)',
    '        [deep indented](gone3.md)',
    'real [after](after.md)',
  ].join('\n');
  const links = extractLinks(src, '/proj/r.md');
  assert.deepEqual(links.map((l) => l.text), ['ok', 'after']);
});

test('links inside HTML comments are ignored', () => {
  const src = [
    '<!-- [hidden](nope.md) -->',
    'real [ok](real.md) <!-- [more](also-nope.md) --> [after](after.md)',
    '<!--',
    '[multi-line](multi-nope.md)',
    'still comment [x](y.md)',
    '-->',
    '[final](final.md)',
  ].join('\n');
  const links = extractLinks(src, '/proj/r.md');
  assert.deepEqual(links.map((l) => l.text), ['ok', 'after', 'final']);
});

test('line numbers are 1-based and match the file', () => {
  const src = ['', '', 'broken [b](b.md)', '', 'last [c](c.md)'].join('\n');
  const links = extractLinks(src, '/proj/r.md');
  assert.deepEqual(links.map((l) => l.line), [3, 5]);
});

test('nested brackets in link text are handled', () => {
  const src = '[outer [ [nested] ]](target.md)';
  const links = extractLinks(src, '/proj/r.md');
  assert.equal(links.length, 1);
  assert.equal(links[0].text, 'outer [ [nested] ]');
  assert.equal(links[0].target, 'target.md');
});

test('empty target resolves to empty string, not undefined', () => {
  const src = '[empty]()';
  const links = extractLinks(src, '/proj/r.md');
  assert.equal(links.length, 1);
  assert.equal(links[0].target, '');
});