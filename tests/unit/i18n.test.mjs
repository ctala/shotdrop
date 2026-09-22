// Every string the UI shows exists in both languages, and every key the code asks for is defined.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const EXT = new URL('../../extension/', import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, EXT), 'utf8');
const messages = (lang) => JSON.parse(read(`_locales/${lang}/messages.json`));

test('en and es have exactly the same keys', () => {
  const en = Object.keys(messages('en')).sort();
  const es = Object.keys(messages('es')).sort();
  assert.deepEqual(es, en);
});

test('placeholders match between languages', () => {
  const en = messages('en');
  const es = messages('es');
  const tokens = (s) => (s.match(/\{\w+\}|\$\d/g) || []).sort();
  for (const k of Object.keys(en)) assert.deepEqual(tokens(es[k].message), tokens(en[k].message), k);
});

test('every key used in HTML and JS is defined', () => {
  const en = messages('en');
  const sources = ['panel.html', 'options.html', 'panel.js', 'options.js', 'manifest.json'].map(read).join('\n');
  const used = new Set([
    ...[...sources.matchAll(/data-i18n(?:-[a-z-]+)?="(\w+)"/g)].map((m) => m[1]),
    ...[...sources.matchAll(/\bt\('(\w+)'/g)].map((m) => m[1]),
    ...[...sources.matchAll(/__MSG_(\w+)__/g)].map((m) => m[1]),
  ]);
  assert.ok(used.size > 10, `only ${used.size} keys found, the scan is probably broken`);
  for (const k of used) assert.ok(en[k], `missing key: ${k}`);
});

test('the Store short description fits in 132 characters', () => {
  for (const lang of ['en', 'es']) {
    const d = messages(lang).extDescription.message;
    assert.ok(d.length <= 132, `${lang}: ${d.length} chars`);
  }
});
