# Sorter — CLAUDE.md

App Electron para triar y organizar renders de BMP. Categoriza automáticamente por prenda y producto real de brotherhood.com.co.

## Comandos

```bash
npm run dev          # dev en puerto 5174
npm run typecheck    # tsc --noEmit
GH_TOKEN=$(gh auth token) bash scripts/publish.sh  # build + release (arm64 primero, luego x64)
```

**Versión actual:** v1.3.0 (2026-07-03)

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
