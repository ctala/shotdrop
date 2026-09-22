// One version everywhere: the extension, the server, both packages and the changelog.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

test('extension, server, packages and changelog share the same version', () => {
  const manifest = JSON.parse(read('extension/manifest.json')).version;
  const found = {
    'package.json': JSON.parse(read('package.json')).version,
    'worker/package.json': JSON.parse(read('worker/package.json')).version,
    'worker/src/index.js': read('worker/src/index.js').match(/const VERSION = '([^']+)'/)[1],
    'CHANGELOG.md': read('CHANGELOG.md').match(/^## \[(\d+\.\d+\.\d+)\]/m)[1],
  };
  for (const [file, v] of Object.entries(found)) assert.equal(v, manifest, `${file} says ${v}, manifest says ${manifest}`);
});
