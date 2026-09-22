/**
 * shotdrop server — stores an image in R2 and returns a short link that expires.
 *
 * Why a Worker sits in the middle: the browser extension never holds R2 credentials.
 * It only knows UPLOAD_TOKEN, which can upload and delete, nothing else, and is rotated
 * with `wrangler secret put UPLOAD_TOKEN`. The bucket stays private and is served from here.
 *
 * Expiry is enforced here too (on read and by an hourly cron), so a one-click deploy
 * needs no manual R2 lifecycle rule.
 */

const VERSION = '1.0.0';
const MAX_BYTES = 25 * 1024 * 1024;
const DAY_MS = 24 * 60 * 60 * 1000;

// Images only: this is for handing over screenshots, not a file host.
const EXT = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

const KEY_RE = /^[0-9a-f]{16}\.(png|jpg|webp|gif)$/;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, DELETE, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-max-age': '86400',
};

const MESSAGES = {
  unauthorized: 'Missing or invalid upload token.',
  not_configured: 'The server has no UPLOAD_TOKEN secret configured.',
  unsupported_type: 'Only PNG, JPEG, WebP and GIF images are accepted.',
  too_large: 'The image is larger than 25 MB.',
  method_not_allowed: 'Method not allowed.',
};

const error = (code, status) =>
  new Response(JSON.stringify({ error: code, message: MESSAGES[code] }), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...CORS },
  });

const notFound = () =>
  new Response('This screenshot no longer exists.', {
    status: 404,
    headers: { 'content-type': 'text/plain; charset=utf-8', ...CORS },
  });

const ttlMs = (env) => {
  const days = Number(env.TTL_DAYS);
  return (Number.isFinite(days) && days > 0 ? days : 7) * DAY_MS;
};

const isExpired = (uploaded, env, now = Date.now()) => now - uploaded.getTime() >= ttlMs(env);

// Fails closed: with no secret configured, "Bearer undefined" must not be a valid key.
function authorize(req, env) {
  if (!env.UPLOAD_TOKEN) return error('not_configured', 503);
  if (req.headers.get('authorization') !== `Bearer ${env.UPLOAD_TOKEN}`) return error('unauthorized', 401);
  return null;
}

// 16 hex chars = 64 bits. With objects deleted after the TTL, guessing a key is not a realistic threat.
function newKey(ext) {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return `${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')}.${ext}`;
}

async function upload(req, env, url) {
  if (req.method !== 'POST') return error('method_not_allowed', 405);
  const denied = authorize(req, env);
  if (denied) return denied;

  const type = (req.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const ext = EXT[type];
  if (!ext) return error('unsupported_type', 415);

  if (Number(req.headers.get('content-length') || 0) > MAX_BYTES) return error('too_large', 413);

  const key = newKey(ext);
  await env.SHOTS.put(key, req.body, { httpMetadata: { contentType: type } });

  return new Response(
    JSON.stringify({ url: `${url.origin}/${key}`, key, expiresAt: Date.now() + ttlMs(env) }),
    { headers: { 'content-type': 'application/json; charset=utf-8', ...CORS } }
  );
}

async function serve(req, env, key) {
  const obj = await env.SHOTS.get(key);
  if (!obj) return notFound();

  if (isExpired(obj.uploaded, env)) {
    await env.SHOTS.delete(key);
    return notFound();
  }

  const headers = new Headers(CORS);
  obj.writeHttpMetadata(headers);
  headers.set('etag', obj.httpEtag);
  // No cache: a deleted screenshot has to stop showing right away, not an hour later.
  headers.set('cache-control', 'no-store');
  headers.set('content-disposition', 'inline');
  headers.set('x-content-type-options', 'nosniff');
  return new Response(req.method === 'HEAD' ? null : obj.body, { headers });
}

async function remove(req, env, key) {
  const denied = authorize(req, env);
  if (denied) return denied;
  await env.SHOTS.delete(key);
  return new Response(null, { status: 204, headers: CORS });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (url.pathname === '/up') return upload(req, env, url);

    if (url.pathname === '/') {
      return new Response(`shotdrop server ${VERSION} ✓ ready\n`, {
        headers: { 'content-type': 'text/plain; charset=utf-8', ...CORS },
      });
    }

    const key = url.pathname.slice(1);
    if (!KEY_RE.test(key)) return notFound();

    if (req.method === 'DELETE') return remove(req, env, key);
    if (req.method === 'GET' || req.method === 'HEAD') return serve(req, env, key);
    return error('method_not_allowed', 405);
  },

  // Hourly cleanup, so expired objects do not pile up even if nobody opens their link.
  // List everything first, delete after: never mutate the bucket while paging through it.
  async scheduled(_event, env) {
    const now = Date.now();
    const expired = [];
    let cursor;
    do {
      const page = await env.SHOTS.list({ cursor });
      for (const o of page.objects) if (isExpired(o.uploaded, env, now)) expired.push(o.key);
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);

    // R2 deletes up to 1000 keys per call.
    for (let i = 0; i < expired.length; i += 1000) await env.SHOTS.delete(expired.slice(i, i + 1000));
  },
};
