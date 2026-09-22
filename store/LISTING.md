# Chrome Web Store listing

Everything the Developer Dashboard asks for, ready to paste. Upload `dist/shotdrop-<version>.zip` (`npm run build`).

## Store listing

| Field | Value |
|---|---|
| Name | shotdrop (from the manifest) |
| Summary | from `extDescription` in `_locales/*/messages.json` |
| Category | Developer Tools |
| Languages | English (default), Spanish |
| Icon | `store/icon-store-128.png` |
| Screenshots (1280×800) | `store/screenshot-1-<lang>.png`, `store/screenshot-2-<lang>.png` |
| Small promo tile (440×280) | `store/promo-small-<lang>.png` |
| Homepage URL | https://github.com/ctala/shotdrop |
| Support URL | https://github.com/ctala/shotdrop/issues |

### Description (English)

```
Drop a screenshot, get a short link that expires. Made for handing screenshots to AI agents.

AI coding agents like Claude Code often run in a terminal on another machine, over SSH or in the cloud, where you can't paste an image. shotdrop turns a screenshot into a link any agent can download.

HOW IT WORKS
• Drag a screenshot into the side panel, or paste it with Cmd+V / Ctrl+V.
• A short link lands in your clipboard.
• The "Agent" button copies a ready-to-paste instruction: download it with curl and read it.
• Links expire after 7 days (configurable), or delete them instantly.

YOUR OWN STORAGE
Screenshots go to a private Cloudflare R2 bucket in your own account, through a small server you deploy with one click (instructions in the project page). Nothing goes to the developer or to any third party.

PRIVATE BY DESIGN
• No analytics, no tracking, no remote fonts.
• No host permissions and no access to the pages you visit.
• Your R2 credentials never touch the browser: the extension only knows your server address and an upload token.

Free and open source (MIT): https://github.com/ctala/shotdrop
Available in English and Spanish.
```

### Descripción (español)

```
Suelta una captura y recibe un link corto que caduca. Hecho para pasarle capturas a agentes de IA.

Los agentes de programación como Claude Code suelen correr en una terminal en otra máquina, por SSH o en la nube, donde no se puede pegar una imagen. shotdrop convierte una captura en un link que cualquier agente puede descargar.

CÓMO FUNCIONA
• Arrastra una captura al panel lateral o pégala con Cmd+V / Ctrl+V.
• Un link corto queda en tu portapapeles.
• El botón "Agente" copia una instrucción lista para pegar: descárgala con curl y léela.
• Los links caducan a los 7 días (configurable), o los borras al instante.

TU PROPIO ALMACENAMIENTO
Las capturas van a un bucket privado de Cloudflare R2 en tu propia cuenta, a través de un servidor pequeño que despliegas con un clic (instrucciones en la página del proyecto). Nada llega al desarrollador ni a terceros.

PRIVADO POR DISEÑO
• Sin analítica, sin rastreo, sin fuentes remotas.
• Sin permisos de host y sin acceso a las páginas que visitas.
• Tus credenciales de R2 nunca pasan por el navegador: la extensión solo conoce la dirección de tu servidor y un token de subida.

Gratis y de código abierto (MIT): https://github.com/ctala/shotdrop
Disponible en español e inglés.
```

## Privacy practices

| Field | Value |
|---|---|
| Single purpose | Upload a screenshot the user drops or pastes to the user's own server and copy a short link to it that expires. |
| `storage` | Saves the user's server address, upload token and the list of recent links, only on the device. |
| `sidePanel` | The extension's whole interface is a side panel, which stays open while the user drags a file from another app. |
| `clipboardWrite` | Copies the link (or the agent instruction) to the clipboard when an upload finishes. |
| Remote code | No. All code is in the package. |
| Data usage | Does not collect or transmit user data to the developer or third parties. Images and the token go only to the server address the user configures, in the user's own Cloudflare account. |
| Privacy policy URL | https://github.com/ctala/shotdrop/blob/main/PRIVACY.md |

Certify: not sold to third parties · not used for unrelated purposes · not used for creditworthiness or lending.
