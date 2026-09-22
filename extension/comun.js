// Compartido por el panel y la pagina de opciones.

const ENDPOINT_POR_DEFECTO = 'https://shots.cristiantala.com';

// Sin esquema, fetch("shots.cristiantala.com/up") se resuelve contra el origen de la propia
// extension (chrome-extension://<id>/shots...) y falla con un "Failed to fetch" mudo.
function normalizarEndpoint(valor) {
  let e = (valor || '').trim();
  if (!e) return ENDPOINT_POR_DEFECTO;
  // http:// se sube a https: el token no viaja en claro.
  e = e.replace(/^[`'"<(\s]+/, '').replace(/^http:\/\//i, 'https://');
  if (!/^https:\/\//i.test(e)) e = `https://${e}`;
  // Solo esquema + host (+ puerto). Lo que venga pegado de un chat — coma, punto, backtick,
  // /up, espacios — se descarta: con "shots.cristiantala.com," Chrome busca otro servidor.
  const m = e.match(/^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?/i);
  return m ? m[0].toLowerCase() : e;
}

// Un POST vacio contesta 415 si el token es valido (paso la auth, fallo el tipo) y 401 si no.
async function probarConexion(endpoint, token) {
  let r;
  try {
    r = await fetch(`${endpoint}/up`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'text/plain' },
      body: '',
    });
  } catch {
    return { ok: false, mensaje: `No pude conectar con ${endpoint}. Revisa que la dirección esté bien.` };
  }
  if (r.status === 415) return { ok: true, mensaje: 'Conectado, token válido ✓' };
  if (r.status === 401) return { ok: false, mensaje: 'El servidor responde, pero el token no es válido.' };
  return { ok: false, mensaje: `Respuesta inesperada del servidor (${r.status}).` };
}
