import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const CLI = path.resolve(here, '..', 'bin', 'linkcheck.js');

export function makeTree(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'linkcheck-test-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(root, rel);
    if (rel.endsWith('/')) {
      fs.mkdirSync(full, { recursive: true });
      continue;
    }
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, typeof content === 'string' ? content : JSON.stringify(content));
  }
  return root;
}

export function runCli(args, options = {}) {
  const res = spawnSync(process.execPath, [CLI, ...args], {
    cwd: options.cwd || process.cwd(),
    encoding: 'utf8',
  });
  return { code: res.status, stdout: res.stdout, stderr: res.stderr };
}