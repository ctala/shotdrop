# Privacy policy

*Last updated: September 22, 2026 · [Español abajo](#política-de-privacidad)*

**shotdrop collects no data.** There is no analytics, telemetry, advertising or tracking of any kind, and the extension makes no request to the developer or to any third party.

## What the extension handles

- **The images you drop or paste.** They are sent only to the server address **you** enter in Settings: a Cloudflare Worker running in **your own** Cloudflare account. The developer never receives them.
- **Your server address and upload token.** Stored only on your device, in `chrome.storage.local`, and sent only to that server.
- **Your recent links** (up to 10, with their expiry date). Stored only on your device. Expired links are removed automatically.

## What the extension does not do

It does not read the pages you visit, has no content scripts and no host permissions, does not sell or share data, and does not use data for anything other than uploading, listing and deleting your screenshots.

## Your server

Images are kept in your private R2 bucket until they expire (7 days by default) or until you delete them. Anyone who has a link can open that image until then. Cloudflare's own policies apply to your account: see [cloudflare.com/privacypolicy](https://www.cloudflare.com/privacypolicy/).

## Contact

Questions: open an issue at [github.com/ctala/shotdrop](https://github.com/ctala/shotdrop/issues).

---

# Política de privacidad

*Última actualización: 22 de septiembre de 2026*

**shotdrop no recolecta datos.** No hay analítica, telemetría, publicidad ni rastreo de ningún tipo, y la extensión no hace pedidos al desarrollador ni a terceros.

## Qué maneja la extensión

- **Las imágenes que sueltas o pegas.** Se envían solo a la dirección de servidor que **tú** escribes en la Configuración: un Worker de Cloudflare que corre en **tu propia** cuenta. El desarrollador nunca las recibe.
- **La dirección de tu servidor y tu token de subida.** Se guardan solo en tu dispositivo, en `chrome.storage.local`, y se envían solo a ese servidor.
- **Tus links recientes** (hasta 10, con su fecha de caducidad). Se guardan solo en tu dispositivo. Los vencidos se eliminan solos.

## Qué no hace

No lee las páginas que visitas, no tiene scripts de contenido ni permisos de host, no vende ni comparte datos, y no usa datos para nada más que subir, listar y borrar tus capturas.

## Tu servidor

Las imágenes quedan en tu bucket privado de R2 hasta que caducan (7 días por defecto) o hasta que las borras. Mientras tanto, cualquiera que tenga el link puede abrir esa imagen. A tu cuenta se le aplican las políticas de Cloudflare: ver [cloudflare.com/privacypolicy](https://www.cloudflare.com/privacypolicy/).

## Contacto

Preguntas: abre un issue en [github.com/ctala/shotdrop](https://github.com/ctala/shotdrop/issues).
