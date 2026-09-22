// Pure logic of the extension: no browser, no network.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  normalizeEndpoint,
  alive,
  agentPrompt,
  errorMessageKey,
  connectionResult,
  TTL_FALLBACK_MS,
  translate,
} from '../../extension/common.js';

const messages = (lang) =>
  JSON.parse(fs.readFileSync(new URL(`../../extension/_locales/${lang}/messages.json`, import.meta.url)));

describe('normalizeEndpoint', () => {
  const OK = 'https://shots.example.com';
  const cases = [
    'https://shots.example.com',
    'https://shots.example.com,', // copied from a chat, with the comma
    'https://shots.example.com.',
    '`https://shots.example.com`',
    '(https://shots.example.com)',
    '"shots.example.com"',
    ' shots.example.com/up/ ',
    'shots.example.com',
    'http://shots.example.com', // upgraded: the token must not travel in clear text
    'HTTPS://Shots.Example.com',
  ];
  for (const c of cases) test(JSON.stringify(c), () => assert.equal(normalizeEndpoint(c), OK));

  test('keeps workers.dev subdomains', () => {
    assert.equal(normalizeEndpoint('shotdrop.me.workers.dev/'), 'https://shotdrop.me.workers.dev');
  });

  test('keeps the port', () => {
    assert.equal(normalizeEndpoint('https://shots.example.com:8443/up'), 'https://shots.example.com:8443');
  });

  test('localhost stays on http, for local development', () => {
    assert.equal(normalizeEndpoint('http://localhost:8787/'), 'http://localhost:8787');
    assert.equal(normalizeEndpoint('localhost:8787'), 'http://localhost:8787');
    assert.equal(normalizeEndpoint('127.0.0.1:8787'), 'http://127.0.0.1:8787');
  });

  test('empty stays empty: there is no default server', () => {
    assert.equal(normalizeEndpoint(''), '');
    assert.equal(normalizeEndpoint('   '), '');
    assert.equal(normalizeEndpoint(undefined), '');
  });
});

describe('alive', () => {
  const now = Date.UTC(2026, 8, 22);
  test('uses expiresAt from the server', () => {
    const h = [
      { url: 'a', expiresAt: now + 1000 },
      { url: 'b', expiresAt: now - 1 },
    ];
    assert.deepEqual(alive(h, now).map((x) => x.url), ['a']);
  });
  test('entries saved before expiresAt existed fall back to date + 7 days', () => {
    const h = [
      { url: 'fresh', fecha: now - TTL_FALLBACK_MS + 60_000 },
      { url: 'old', fecha: now - TTL_FALLBACK_MS - 1 },
    ];
    assert.deepEqual(alive(h, now).map((x) => x.url), ['fresh']);
  });
  test('handles a missing history', () => assert.deepEqual(alive(undefined, now), []));
});

describe('agentPrompt', () => {
  const url = 'https://shots.example.com/0123456789abcdef.png';
  for (const lang of ['en', 'es']) {
    test(`${lang}: tells the agent how to download and read it`, () => {
      const p = agentPrompt(url, messages(lang).agentPrompt.message);
      assert.ok(p.includes(`curl -so /tmp/0123456789abcdef.png ${url}`), p);
      assert.ok(p.includes('/tmp/0123456789abcdef.png'), p);
      assert.ok(!p.includes('{'), `unreplaced placeholder: ${p}`);
    });
  }
});

describe('errorMessageKey', () => {
  test('maps every server error code to a translated message', () => {
    const en = messages('en');
    for (const code of ['unauthorized', 'not_configured', 'unsupported_type', 'too_large', 'method_not_allowed']) {
      const key = errorMessageKey(code);
      assert.ok(key && en[key], `${code} → ${key}`);
    }
  });
  test('unknown codes return null so the raw message is shown', () => {
    assert.equal(errorMessageKey('something_new'), null);
  });
});

describe('connectionResult', () => {
  // An empty text/plain POST passes auth and then fails the type check (415) only with a valid token.
  test('415 means connected with a valid token', () => assert.equal(connectionResult(415), 'ok'));
  test('401 means the token is wrong', () => assert.equal(connectionResult(401), 'badToken'));
  test('503 means the server has no token set', () => assert.equal(connectionResult(503), 'notConfigured'));
  test('anything else is unexpected', () => assert.equal(connectionResult(500), 'unexpected'));
});

describe('translate', () => {
  const en = { dropTitle: { message: 'Drop your screenshot here' }, connFail: { message: "Couldn't reach {endpoint}." } };
  const catalog = (map) => (k) => map[k] ?? '';

  test('uses the browser catalog when it has the key', () => {
    assert.equal(translate('dropTitle', {}, catalog({ dropTitle: 'Suelta la captura aquí' }), en), 'Suelta la captura aquí');
  });

  // Unpacked extensions read HTML/JS from disk on every open, but the catalog only on (re)load.
  // Updated files without pressing reload used to show raw keys ("dropTitle", "agentPrompt").
  test('falls back to the bundled English when the catalog is not loaded', () => {
    assert.equal(translate('dropTitle', {}, catalog({}), en), 'Drop your screenshot here');
  });

  test('fills placeholders in the fallback too', () => {
    assert.equal(translate('connFail', { endpoint: 'https://x.dev' }, catalog({}), en), "Couldn't reach https://x.dev.");
  });

  test('only as a last resort returns the key itself', () => {
    assert.equal(translate('missing', {}, catalog({}), en), 'missing');
  });
});
