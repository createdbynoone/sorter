# Sorter — CLAUDE.md

App Electron para triar y organizar renders de BMP. Categoriza automáticamente por prenda y producto real de brotherhood.com.co.

## Comandos

```bash
npm run dev          # dev en puerto 5174
npm run typecheck    # tsc --noEmit
GITHUB_TOKEN=... bash scripts/publish.sh  # build + release (arm64 primero, luego x64)
```

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
- FocusView (`z-40`) NO pone `titlebar-nodrag` en el div raíz — solo en botones específicos
- Botón Export flotante: `titlebar-nodrag absolute bottom-5 right-5`

## Protocolo localfile://

Registrado con `corsEnabled: true` para que canvas no se tinte al cargar imágenes.
Imágenes en canvas deben usar `img.crossOrigin = 'anonymous'`.

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

## DB

- `userData/sorter-db.json`
- `ImageEntry.fingerprint` = `${size}:${round(birthtimeMs)}`
- Flush síncrono en `before-quit`
