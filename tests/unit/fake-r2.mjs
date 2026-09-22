// R2 en memoria con la parte de la API que usa el Worker: put, get, delete y list paginado.
export class FakeR2 {
  constructor() {
    this.objetos = new Map();
    this.limiteListado = 1000;
  }

  async put(key, body, opciones = {}) {
    const datos = new Uint8Array(await new Response(body).arrayBuffer());
    this.objetos.set(key, { datos, httpMetadata: opciones.httpMetadata || {}, uploaded: new Date() });
  }

  async get(key) {
    const o = this.objetos.get(key);
    if (!o) return null;
    return {
      key,
      uploaded: o.uploaded,
      httpEtag: `"${key}"`,
      body: new Response(o.datos).body,
      writeHttpMetadata(h) {
        if (o.httpMetadata.contentType) h.set('content-type', o.httpMetadata.contentType);
      },
    };
  }

  async delete(keys) {
    for (const k of [keys].flat()) this.objetos.delete(k);
  }

  // Como R2: orden lexicografico y cursor opaco anclado a la ultima clave devuelta.
  async list({ cursor } = {}) {
    const todas = [...this.objetos.entries()]
      .map(([key, o]) => ({ key, uploaded: o.uploaded }))
      .sort((a, b) => a.key.localeCompare(b.key))
      .filter((o) => !cursor || o.key > cursor);
    const pagina = todas.slice(0, this.limiteListado);
    const truncated = todas.length > this.limiteListado;
    return { objects: pagina, truncated, cursor: truncated ? pagina.at(-1).key : undefined };
  }

  // --- ayudas de test
  envejecer(key, ms) {
    const o = this.objetos.get(key);
    o.uploaded = new Date(o.uploaded.getTime() - ms);
  }
  existe(key) { return this.objetos.has(key); }
  tamano() { return this.objetos.size; }
  contenidoTipo(key) { return this.objetos.get(key)?.httpMetadata.contentType; }
}
