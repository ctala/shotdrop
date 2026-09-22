# shotdrop

Arrastras una captura al panel lateral de Chrome y te queda el link en el portapapeles.
El archivo vive en **tu** R2 y se borra solo a los 7 días.

```
captura (⌘⇧4)  →  arrastras al panel  →  https://shots.cristiantala.com/a7f3k9c2.png
```

Del otro lado, el agente de la otra máquina hace `curl -o /tmp/x.png <link>` y la lee.

## Por qué hay un Worker en medio

La extensión corre en el navegador. Si firmara contra R2 directo, la access key del bucket
quedaría guardada en Chrome. Acá la extensión solo conoce `UPLOAD_TOKEN`, que sirve
únicamente para subir y se rota en un comando. El bucket es privado y se sirve por el Worker.

## Montarlo

```bash
cd worker

wrangler r2 bucket create shots
wrangler r2 bucket lifecycle add shots expira-7d --expire-days 7 -y

TOKEN=$(openssl rand -hex 24)
echo -n "$TOKEN" | wrangler secret put UPLOAD_TOKEN
echo "$TOKEN"   # esto va a Infisical y al campo Token de la extensión

wrangler deploy  # publica shots.cristiantala.com
```

El valor del token vive **solo en Infisical** (`prod` · `/storage` · `SHOTDROP_UPLOAD_TOKEN`)
y en el perfil de Chrome. No se copia a ningún archivo del repo.

⚠️ El CLI de Infisical (0.43) **no** interpreta `CLAVE=@archivo`: guarda la ruta como valor.
Pasar el valor directo y verificar con `secrets get` que coincide.

## Instalar la extensión

1. `chrome://extensions` → activar **Modo de desarrollador**
2. **Cargar descomprimida** → elegir la carpeta `extension/`
3. Clic en el icono → **Configuración** → pegar `https://shots.cristiantala.com` y el token

En Windows es el mismo procedimiento: la extensión es la misma.

## Probar sin la extensión

```bash
curl -X POST https://shots.cristiantala.com/up \
  -H "authorization: Bearer $TOKEN" \
  -H "content-type: image/png" \
  --data-binary @captura.png
```

Devuelve `{"url": "..."}`. Esto es lo que usaría un agente del Spark, donde no hay navegador.

## Límites de esta versión

- Solo imágenes (png, jpg, webp, gif), 25 MB máximo
- La captura la sacas tú con `⌘⇧4`. Capturar la página desde el navegador es la v2
- La expiración es del bucket, no por archivo: son 7 días para todos

## Probar el panel antes de recargar la extensión

`node --check` solo mira la sintaxis. Esto ejecuta `extension/panel.js` tal cual contra el
servidor real (5 casos: drop, pegar, no-imagen, token malo, archivo temporal borrado):

```bash
SHOTDROP_UPLOAD_TOKEN=<de Infisical> node tests/probar_panel.mjs
```

Y la prueba que de verdad importa: carga la extensión en Chromium, la configura por su página
de opciones y suelta una imagen en el panel. Así se detectó el "Failed to fetch" por un
endpoint sin `https://` (requiere `npm i playwright`):

```bash
SHOTDROP_UPLOAD_TOKEN=<de Infisical> ENDPOINT=shots.cristiantala.com node tests/extension_real.mjs
```
