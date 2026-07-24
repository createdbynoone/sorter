# Sorter — CLAUDE.md

App Electron para triar y organizar renders de BMP. Categoriza automáticamente por prenda y producto real de brotherhood.com.co.

## Comandos

```bash
npm run dev          # dev en puerto 5174
npm run typecheck    # tsc --noEmit
GH_TOKEN=$(gh auth token) bash scripts/publish.sh  # build + release (arm64 primero, luego x64)
```

**Versión actual:** v1.4.1 (2026-07-24: background networking de Chromium apagado, spellcheck off, ventana con tamaño dinámico por pantalla vía `initialWindowSize()` y zoomFactor 1.1 → 0.95 — GPU/hardware acceleration se deja intacta a propósito porque FocusView reproduce `<video autoPlay>` real, no solo thumbnails)

## Release (electron-builder 26)

El tag DEBE existir en el remoto antes de publicar ("Published releases must have a valid tag" 422):
```bash
npm version X.Y.Z --no-git-tag-version
git add package.json package-lock.json && git commit -m "vX.Y.Z" && git push
git tag vX.Y.Z && git push origin vX.Y.Z
GH_TOKEN=$(gh auth token) bash scripts/publish.sh
```
Verificar que `latest-mac.yml` esté entre los assets del release — sin él no hay auto-update.

## Stack

- Electron 43 + electron-vite 5 + vite 7 + React 18 + TypeScript + Tailwind CSS
- @anthropic-ai/sdk 0.109+ (0.39 rompía con Node de Electron 43: gunzip "Premature close" via node-fetch)
- **Electron 32+ eliminó `File.path`** — drag & drop usa `webUtils.getPathForFile()` expuesto como `window.sorter.getPathForFile`
- zoomFactor 1.1 global (+10% UI); will-navigate prevented + setWindowOpenHandler deny
- IPC endurecido: `sorter:open/reveal/get-thumb` solo aceptan paths presentes en `db.entries`
- Contraste: text-secondary #9A9A9A / text-muted #666666; animaciones menu-in/panel-in/fade-in; button:active scale global
- Preload MUST ser CommonJS (`.cjs`) — configurado en `rollupOptions.output.format: 'cjs'`
- Design tokens: bg `#0c0c0c`, surface `#141414`, border `#242424`, accent `#E8B547`
- Tipografía: siempre inline `text-[11.7px]` etc., NO tokens nombrados

## Estructura clave

```
electron/
  main.ts       — IPC handlers, watcher, clasificación, export, library copy
  preload.ts    — contextBridge; DEBE compilar como CJS
src/
  App.tsx       — estado global, grid, routing a FocusView
  components/
    FocusView.tsx     — zoom, pan, export shortcut
    ExporterPanel.tsx — modal export, compositor canvas
    Inspector.tsx     — metadata, resolución, categorías
    TitleBar.tsx      — drag region nativo
build/
  watermarks/   — PNGs de watermark (Box/Vertical × UP/DOWN × Black/White)
```

## Drag region (macOS titlebar)

- `TitleBar` tiene clase `titlebar-drag`; elementos interactivos tienen `titlebar-nodrag`
- Electron calcula `-webkit-app-region` en TODO el DOM sin importar z-index
- **FocusView top bar (v1.2.1):** overlay `fixed inset-0 z-40` cubre el titlebar real, así que su barra superior es `titlebar-drag h-11` con `paddingLeft: 92px` (inset de semáforos); botón Grid y flechas de navegación llevan `titlebar-nodrag`
- Botón Export flotante: `titlebar-nodrag absolute bottom-5 right-5`
- Cualquier overlay fullscreen nuevo con contenido arriba-izquierda debe repetir este patrón

## Protocolo localfile://

Registrado con `corsEnabled: true` para que canvas no se tinte al cargar imágenes.
Imágenes en canvas deben usar `img.crossOrigin = 'anonymous'`.

- **`standard: true` es obligatorio** para que `<video>`/`<audio>` funcionen — sin esto Chromium
  rechaza cualquier respuesta con `MEDIA_ERR_SRC_NOT_SUPPORTED` sin importar los headers
  (confirmado en Electron 43; ver electron/electron#51442). `stream: true` además, para que el
  media pipeline espere una respuesta streameada/ranged.
- Parsing de URL con `standard: true` colapsa las barras iniciales en un componente de
  autoridad — `localfile:///Volumes/...` parsea "Volumes" como host. Por eso `toLocalFileUrl()`
  (en `src/utils/media.ts` y espejado en `main.ts`) inserta un host dummy: `localfile://-/Volumes/...`.
  SIEMPRE usar ese helper para construir URLs `localfile://`, nunca template literals directos.
- El handler ya NO delega a `net.fetch('file://...')` — ese método ignora el header `Range` y
  siempre devuelve 200, lo que Chromium interpreta como fuente no soportada para `<video>`.
  Ahora parsea `Range` manualmente y sirve `206`/`Content-Range` con lectura directa (`readByteRange`).
- **`isServableLocalFile()` (v1.4.0)** — antes el handler servía CUALQUIER path que existiera en
  disco, sin containment (vulnerabilidad real: un renderer comprometido podía leer archivos
  arbitrarios del sistema vía `localfile://`). Ahora solo sirve paths presentes en `db.entries`
  o dentro de `thumbsDir()`, y exige `unlocked` (ver Lock screen abajo).

## Lock screen (v1.4.0)

- Primer arranque en una máquina pide una passphrase antes de tocar el vault/DB.
- `electron/main.ts`: solo vive el hash scrypt+salt (`LOCK_SALT_HEX`/`LOCK_HASH_HEX`) — la
  passphrase en texto plano nunca está en el código ni en el bundle. Verificación con
  `timingSafeEqual`. Backoff exponencial persistido en `sorter-prefs.json`
  (`authFailCount`/`authLockUntil`) — reiniciar la app no resetea el cooldown.
- Una vez correcta, `unlockedAt` queda en prefs y no vuelve a pedirla en esa máquina.
- **`bootData()`** — todo lo que antes corría sin condición en `app.whenReady()` (scan de
  Desktop, `initAnthropic()`, clasificación automática, catálogo, watcher) ahora solo corre
  DESPUÉS de desbloquear — evita escanear el filesystem y gastar créditos de la API de Claude
  en una app que nadie desbloqueó todavía.
- Defensa en profundidad: `handleWhenUnlocked()` envuelve todos los IPC `sorter:*` y el
  protocolo `localfile://` — el backend rechaza aunque alguien salte el `LockScreen.tsx` de la UI.
- Para regenerar el hash si cambia la passphrase: `node -e "const c=require('crypto');const s=c.randomBytes(16);console.log(s.toString('hex'), c.scryptSync('NUEVA_CLAVE',s,64).toString('hex'))"` y reemplazar `LOCK_SALT_HEX`/`LOCK_HASH_HEX`.

## CSP

`src/index.html` ahora tiene Content-Security-Policy (no existía antes). `img-src`/`media-src`
incluyen el scheme `localfile:` para que imágenes y video carguen; no hay `connect-src` externo
porque el renderer nunca hace fetch a dominios remotos (el fetch a brotherhood.com.co y a la API
de Anthropic corren en el proceso principal, no en el renderer).

## Library (imágenes importadas)

- Drag & drop externo → copia a `userData/library/` antes de reconcile
- Archivos ya en `watchPath` o `library/` no se duplican
- `entry.source` = `'drop'` para imágenes de library

## Missing detection

- Solo marcar `missing` si `entry.source === 'desktop'` Y `!existsSync(path)`
- Entradas de `folder` / `drop` NUNCA se marcan missing en el escaneo de desktop

## Export (ExporterPanel)

- Compositor en renderer con Canvas API — cover (Math.max), no letterbox
- Tamaños: Box 1080×1080, Vertical 1080×1920
- Watermarks: `build/watermarks/*.png` → `extraResources` → `resources/watermarks/` en prod
- `getWatermarksPath()` devuelve ruta correcta según `app.isPackaged`
- IPC: `sorter:save-exports`, `sorter:read-watermark`, `sorter:get-watermarks-path`

## Auto-update

- `scripts/publish.sh` — secuencial arm64 → x64 (evita sha512 mismatch por firma paralela)
- NUNCA `--publish always` directo; siempre usar el script

## Video support (v1.3.0)

- `MEDIA_EXT`/`VIDEO_EXT` (mp4/mov/webm/m4v) — reconoce video en drop, import, watcher (`BMP_PATTERN`)
- Thumbnail de video = frame real decodificado en una `BrowserWindow` oculta reutilizable
  (`getThumbWin` + `captureVideoFrame`), NO ffmpeg — un binario nativo por-arch rompería el
  build cruzado arm64/x64 de `publish.sh`. Requiere `webSecurity: false` en esa ventana oculta
  (una página `data:` no puede cargar `file://` en un `<video>` si no) y las llamadas se
  serializan (`videoThumbChain`) porque esa ventana solo decodifica un video a la vez.
- Frame se escala a max 400px lado largo (igual que thumbs de imagen) — antes se guardaba a
  resolución nativa del video, inflando el thumb y el ícono de drag-out (ver abajo).
- Auto-classify usa ese mismo frame extraído — funciona igual que con imágenes.
- FocusView reproduce con `<video controls autoPlay>`; zoom/pan/export se deshabilitan para video
  (no aplican). Si falla la decodificación, overlay con "Reveal in Finder" en vez de pantalla negra.

## Drag-out nativo (`sorter:drag-start`)

- `webContents.startDrag({ file, icon })` entrega el archivo ORIGINAL (no copia, calidad completa)
  a otra app (Finder, BMP, etc.) — icono debe resolverse síncrono porque tiene que dispararse en
  respuesta directa al gesto `dragstart` del renderer, así que lee el thumb ya cacheado en disco
  en vez de generarlo on-demand.
- Icono se re-escala a max 80px — un thumb de 400px como cursor de drag se ve gigante.

## DB

- `userData/sorter-db.json`
- `ImageEntry.fingerprint` = `${size}:${round(birthtimeMs)}`
- Flush síncrono en `before-quit`
