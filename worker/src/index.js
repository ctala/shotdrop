/**
 * shotdrop — sube una imagen a R2 y devuelve un link corto que caduca.
 *
 * POR QUE EXISTE UN WORKER EN VEZ DE HABLAR CON R2 DIRECTO.
 * La extension corre en el navegador. Si firmara contra R2 ella misma, la access key
 * del bucket viviria en Chrome. Aca la extension solo conoce UPLOAD_TOKEN, que se rota
 * con un `wrangler secret put` y no da acceso a nada mas que a subir.
 *
 * El bucket es PRIVADO. Nadie llega a un objeto si no tiene el link, y el link muere
 * cuando la regla de lifecycle borra el objeto (ver README).
 */

const MAX_BYTES = 25 * 1024 * 1024;

// Solo imagenes: esto no es un servicio de archivos, es para pasar capturas.
const EXT = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, DELETE, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-max-age': '86400',
};

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...cors },
  });

// 16 hex = 64 bits. Con el objeto borrandose a los 7 dias, adivinar un nombre no es
// una amenaza realista.
function nuevaClave(ext) {
  const b = new Uint8Array(8);
  crypto.getRandomValues(b);
  const hex = [...b].map((n) => n.toString(16).padStart(2, '0')).join('');
  return `${hex}.${ext}`;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    if (url.pathname === '/up') {
      if (req.method !== 'POST') return json({ error: 'usa POST' }, 405);

      // Sin el secreto cargado, `Bearer ${undefined}` seria una clave valida. Falla cerrado.
      if (!env.UPLOAD_TOKEN) return json({ error: 'servidor sin token configurado' }, 503);
      if (req.headers.get('authorization') !== `Bearer ${env.UPLOAD_TOKEN}`) {
        return json({ error: 'token invalido' }, 401);
      }

      const tipo = (req.headers.get('content-type') || '').split(';')[0].trim();
      const ext = EXT[tipo];
      if (!ext) return json({ error: `tipo no soportado: ${tipo || 'desconocido'}` }, 415);

      const largo = Number(req.headers.get('content-length') || 0);
      if (largo > MAX_BYTES) return json({ error: 'pesa mas de 25 MB' }, 413);

      const clave = nuevaClave(ext);
      await env.SHOTS.put(clave, req.body, { httpMetadata: { contentType: tipo } });

      return json({ url: `${url.origin}/${clave}`, clave });
    }

    const clave = decodeURIComponent(url.pathname.slice(1));
    if (!/^[0-9a-f]{16}\.(png|jpg|webp|gif)$/.test(clave)) return new Response('shotdrop', { status: 404 });

    // Borrar al tiro: para cuando se sube por error una captura con algo sensible.
    if (req.method === 'DELETE') {
      if (!env.UPLOAD_TOKEN) return json({ error: 'servidor sin token configurado' }, 503);
      if (req.headers.get('authorization') !== `Bearer ${env.UPLOAD_TOKEN}`) {
        return json({ error: 'token invalido' }, 401);
      }
      await env.SHOTS.delete(clave);
      return new Response(null, { status: 204, headers: cors });
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') return json({ error: 'metodo no permitido' }, 405);

    const obj = await env.SHOTS.get(clave);
    // Un 404 aca es lo normal cuando el lifecycle ya borro la captura.
    if (!obj) return new Response('esta captura ya no existe', { status: 404 });

    const h = new Headers();
    obj.writeHttpMetadata(h);
    h.set('etag', obj.httpEtag);
    // Sin cache: si se borra, tiene que dejar de verse en ese mismo momento, no en una hora.
    h.set('cache-control', 'no-store');
    h.set('content-disposition', 'inline');
    return new Response(req.method === 'HEAD' ? null : obj.body, { headers: h });
  },
};
