// Pure logic shared by the panel and the settings page. No chrome.* here: it runs in Node tests too.

// Only for history entries saved before the server started returning expiresAt.
export const TTL_FALLBACK_MS = 7 * 24 * 60 * 60 * 1000;

const LOCAL = /^(?:https?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?/i;
const HOST = /^https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)+(?::\d+)?/i;

/**
 * Turns whatever the user pasted into "scheme://host[:port]".
 * Without a scheme, fetch("shots.example.com/up") resolves against the extension's own origin
 * and fails with a silent "Failed to fetch". Chat punctuation (a trailing comma, backticks,
 * quotes) would send the request to a host that does not exist.
 */
export function normalizeEndpoint(value) {
  const v = (value || '').trim().replace(/^[`'"<(\s]+/, '');
  if (!v) return '';

  // Local development is the only place plain http is allowed.
  const local = v.match(LOCAL);
  if (local) return `http://${local[1].toLowerCase()}${local[2] || ''}`;

  // http is upgraded so the token never travels in clear text.
  let e = v.replace(/^http:\/\//i, 'https://');
  if (!/^https:\/\//i.test(e)) e = `https://${e}`;
  const m = e.match(HOST);
  return m ? m[0].toLowerCase() : '';
}

const expiresAt = (entry) => entry.expiresAt ?? (entry.fecha ?? 0) + TTL_FALLBACK_MS;

// A link that no longer works is not shown at all.
export const alive = (history = [], now = Date.now()) => history.filter((h) => expiresAt(h) > now);

export const keyFromUrl = (url) => new URL(url).pathname.slice(1);

export const agentPrompt = (url, template) =>
  template.replaceAll('{url}', url).replaceAll('{file}', keyFromUrl(url));

const ERROR_KEYS = {
  unauthorized: 'errUnauthorized',
  not_configured: 'errNotConfigured',
  unsupported_type: 'errUnsupported',
  too_large: 'errTooLarge',
  method_not_allowed: 'errMethod',
};

export const errorMessageKey = (code) => ERROR_KEYS[code] ?? null;

// An empty text/plain POST passes auth and then fails the type check (415) only with a valid token.
export function connectionResult(status) {
  if (status === 415) return 'ok';
  if (status === 401) return 'badToken';
  if (status === 503) return 'notConfigured';
  return 'unexpected';
}

export async function testConnection(endpoint, token) {
  try {
    const r = await fetch(`${endpoint}/up`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'text/plain' },
      body: '',
    });
    return { result: connectionResult(r.status), status: r.status };
  } catch {
    return { result: 'unreachable', status: 0 };
  }
}

/**
 * Picks the text for a message key. Unpacked extensions read HTML and JS from disk on every open,
 * but the message catalog only when the extension is (re)loaded: after updating the files without
 * pressing reload, getMessage() returns "" and the UI showed raw keys. The bundled English fills in.
 */
export function translate(key, vars, getMessage, fallback) {
  let s = getMessage(key) || fallback?.[key]?.message || key;
  for (const [k, v] of Object.entries(vars || {})) s = s.replaceAll(`{${k}}`, v);
  return s;
}
