// Contrato del Worker. Corre sin red ni cuenta de Cloudflare: R2 se reemplaza por un fake en memoria.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../../worker/src/index.js';
import { FakeR2 } from './fake-r2.mjs';

const TOKEN = 'test-token-123';
const DIA = 24 * 60 * 60 * 1000;
const BASE = 'https://shots.example.com';

let env;
beforeEach(() => {
  env = { SHOTS: new FakeR2(), UPLOAD_TOKEN: TOKEN };
});

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);

function subir({ token = TOKEN, tipo = 'image/png', cuerpo = PNG, largo } = {}) {
  const headers = { 'content-type': tipo };
  if (token !== null) headers.authorization = `Bearer ${token}`;
  if (largo) headers['content-length'] = String(largo);
  return worker.fetch(new Request(`${BASE}/up`, { method: 'POST', headers, body: cuerpo }), env);
}

const pedir = (ruta, init = {}) => worker.fetch(new Request(`${BASE}${ruta}`, init), env);
const claveDe = (url) => new URL(url).pathname.slice(1);

describe('subida', () => {
  test('con token válido guarda la imagen y devuelve url, clave y vencimiento', async () => {
    const antes = Date.now();
    const r = await subir();
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.match(j.key, /^[0-9a-f]{16}\.png$/);
    assert.equal(j.url, `${BASE}/${j.key}`);
    assert.ok(j.expiresAt >= antes + 7 * DIA && j.expiresAt <= Date.now() + 7 * DIA);
    assert.equal(env.SHOTS.contenidoTipo(j.key), 'image/png');
  });

  test('la extensión del archivo sale del tipo', async () => {
    for (const [tipo, ext] of [['image/jpeg', 'jpg'], ['image/webp', 'webp'], ['image/gif', 'gif']]) {
      const j = await (await subir({ tipo })).json();
      assert.ok(j.key.endsWith(`.${ext}`), `${tipo} → ${j.key}`);
    }
  });

  test('sin token o con token malo responde 401 unauthorized', async () => {
    for (const token of [null, 'otro']) {
      const r = await subir({ token });
      assert.equal(r.status, 401);
      assert.equal((await r.json()).error, 'unauthorized');
    }
    assert.equal(env.SHOTS.tamano(), 0);
  });

  test('si el servidor no tiene token configurado falla cerrado con 503', async () => {
    delete env.UPLOAD_TOKEN;
    // Sin este chequeo, "Bearer undefined" seria una clave valida.
    const r = await subir({ token: 'undefined' });
    assert.equal(r.status, 503);
    assert.equal((await r.json()).error, 'not_configured');
  });

  test('rechaza lo que no es imagen con 415 unsupported_type', async () => {
    const r = await subir({ tipo: 'text/plain', cuerpo: 'hola' });
    assert.equal(r.status, 415);
    assert.equal((await r.json()).error, 'unsupported_type');
  });

  test('rechaza más de 25 MB con 413 too_large', async () => {
    const r = await subir({ largo: 26 * 1024 * 1024 });
    assert.equal(r.status, 413);
    assert.equal((await r.json()).error, 'too_large');
  });

  test('GET /up responde 405 method_not_allowed', async () => {
    const r = await pedir('/up');
    assert.equal(r.status, 405);
    assert.equal((await r.json()).error, 'method_not_allowed');
  });
});

describe('lectura', () => {
  test('devuelve la imagen tal cual, sin cache', async () => {
    const { key } = await (await subir()).json();
    const r = await pedir(`/${key}`);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'image/png');
    assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.deepEqual(new Uint8Array(await r.arrayBuffer()), PNG);
  });

  test('una captura vencida responde 404 y se borra, aunque la limpieza no haya corrido', async () => {
    const { key } = await (await subir()).json();
    env.SHOTS.envejecer(key, 8 * DIA);
    const r = await pedir(`/${key}`);
    assert.equal(r.status, 404);
    assert.equal(env.SHOTS.existe(key), false);
  });

  test('TTL_DAYS cambia el plazo', async () => {
    env.TTL_DAYS = '1';
    const { key, expiresAt } = await (await subir()).json();
    assert.ok(expiresAt <= Date.now() + DIA);
    env.SHOTS.envejecer(key, 2 * DIA);
    assert.equal((await pedir(`/${key}`)).status, 404);
  });

  test('una clave con formato inválido responde 404 sin tocar R2', async () => {
    for (const ruta of ['/algo.txt', '/..%2Fsecreto', '/0123.png', '/0123456789abcdef.exe']) {
      const r = await pedir(ruta);
      assert.equal(r.status, 404, ruta);
    }
  });

  test('la raíz confirma que el servidor está listo', async () => {
    const r = await pedir('/');
    assert.equal(r.status, 200);
    assert.match(await r.text(), /shotdrop/i);
  });
});

describe('borrado', () => {
  test('con token borra al tiro y el link deja de funcionar', async () => {
    const { key } = await (await subir()).json();
    const r = await pedir(`/${key}`, { method: 'DELETE', headers: { authorization: `Bearer ${TOKEN}` } });
    assert.equal(r.status, 204);
    assert.equal((await pedir(`/${key}`)).status, 404);
  });

  test('sin token no borra', async () => {
    const { key } = await (await subir()).json();
    const r = await pedir(`/${key}`, { method: 'DELETE' });
    assert.equal(r.status, 401);
    assert.equal(env.SHOTS.existe(key), true);
  });
});

describe('CORS', () => {
  test('el preflight permite subir y borrar desde la extensión', async () => {
    const r = await pedir('/up', { method: 'OPTIONS' });
    assert.equal(r.status, 204);
    assert.equal(r.headers.get('access-control-allow-origin'), '*');
    assert.match(r.headers.get('access-control-allow-methods'), /DELETE/);
    assert.match(r.headers.get('access-control-allow-headers'), /authorization/);
  });

  test('los errores también llevan CORS, para que la extensión lea el motivo', async () => {
    for (const r of [await subir({ token: 'x' }), await pedir('/algo.txt', { method: 'DELETE' })]) {
      assert.equal(r.headers.get('access-control-allow-origin'), '*');
    }
  });
});

describe('limpieza programada', () => {
  test('borra solo lo vencido', async () => {
    const vieja = (await (await subir()).json()).key;
    const nueva = (await (await subir()).json()).key;
    env.SHOTS.envejecer(vieja, 8 * DIA);
    await worker.scheduled({ scheduledTime: Date.now() }, env);
    assert.equal(env.SHOTS.existe(vieja), false);
    assert.equal(env.SHOTS.existe(nueva), true);
  });

  test('recorre todas las páginas del listado', async () => {
    env.SHOTS.limiteListado = 2;
    const claves = [];
    for (let i = 0; i < 5; i++) claves.push((await (await subir()).json()).key);
    claves.forEach((k) => env.SHOTS.envejecer(k, 8 * DIA));
    await worker.scheduled({ scheduledTime: Date.now() }, env);
    assert.equal(env.SHOTS.tamano(), 0);
  });
});
