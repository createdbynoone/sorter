import { app, BrowserWindow, ipcMain, shell, nativeImage, protocol, net, dialog, Menu, screen } from 'electron'
import { join, extname, basename, relative, isAbsolute } from 'path'
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync, createWriteStream, copyFileSync, openSync, readSync, closeSync } from 'fs'
import { watch as fsWatch } from 'fs'
import { homedir } from 'os'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { scryptSync, timingSafeEqual } from 'crypto'
import https from 'https'
import electronUpdater from 'electron-updater'
const { autoUpdater } = electronUpdater

// ─── RAM footprint ──────────────────────────────────────────────────────────
// GPU/hardware acceleration stays ON here (unlike BMP/Product Builder) —
// FocusView plays real <video autoPlay> for the triage preview, not just the
// hidden thumbnail-decode window, and software-only decode would make that
// preview choppier. Only the background-service trimming below applies.
app.commandLine.appendSwitch('disable-background-networking')
app.commandLine.appendSwitch('disable-features', 'MediaRouter,OptimizationGuideModelDownloading,Translate')

const execFileAsync = promisify(execFile)

const SHELL_PATH = [
  '/usr/local/bin', '/opt/homebrew/bin', '/opt/homebrew/sbin',
  '/usr/bin', '/bin', process.env.PATH ?? '',
].join(':')

function shellEnv(): NodeJS.ProcessEnv { return { ...process.env, PATH: SHELL_PATH } }

function downloadFile(url: string, destPath: string): Promise<void> {
  if (!url.startsWith('https://')) return Promise.reject(new Error('Only HTTPS downloads are allowed'))
  return new Promise((resolve, reject) => {
    const file = createWriteStream(destPath)
    https.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close()
        downloadFile(res.headers.location, destPath).then(resolve).catch(reject)
        return
      }
      res.pipe(file)
      file.on('finish', () => file.close(() => resolve()))
      file.on('error', reject)
    }).on('error', reject)
  })
}

function downloadDmgWithProgress(url: string, destPath: string, onProgress: (pct: number) => void): Promise<void> {
  if (!url.startsWith('https://')) return Promise.reject(new Error('Only HTTPS downloads are allowed'))
  return new Promise((resolve, reject) => {
    const attempt = (attemptUrl: string) => {
      if (!attemptUrl.startsWith('https://')) { reject(new Error('Redirect to non-HTTPS blocked')); return }
      const parsed = new URL(attemptUrl)
      https.get({ hostname: parsed.hostname, path: parsed.pathname + parsed.search }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          attempt(res.headers.location); return
        }
        const total = parseInt(res.headers['content-length'] ?? '0', 10)
        let received = 0
        const file = createWriteStream(destPath)
        res.on('data', (chunk: Buffer) => {
          received += chunk.length
          if (total > 0) onProgress(Math.round((received / total) * 100))
        })
        res.pipe(file)
        file.on('finish', () => file.close(() => resolve()))
        file.on('error', reject)
      }).on('error', reject)
    }
    attempt(url)
  })
}

async function installFromDmg(dmgPath: string): Promise<void> {
  const { stdout } = await execFileAsync('hdiutil', ['attach', dmgPath, '-nobrowse', '-plist'], { env: shellEnv() })
  const mountMatch = stdout.match(/<key>mount-point<\/key>\s*<string>([^<]+)<\/string>/)
  if (!mountMatch) throw new Error('DMG mount point not found')
  const mountPoint = mountMatch[1].trim()
  try {
    await execFileAsync('ditto', [`${mountPoint}/Sorter.app`, '/Applications/Sorter.app'], { env: shellEnv() })
  } finally {
    await execFileAsync('hdiutil', ['detach', mountPoint, '-quiet', '-force'], { env: shellEnv() }).catch(() => {})
  }
}

function setupAutoUpdater(win: BrowserWindow) {
  if (!app.isPackaged) return

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false

  const notify = (payload: object) => win.webContents.send('update-status', payload)

  autoUpdater.on('update-available', (info) => {
    notify({ phase: 'available', version: info.version })

    const arch = process.arch === 'arm64' ? '-arm64' : ''
    const filename = `Sorter-${info.version}${arch}.dmg`
    const dmgUrl = `https://github.com/createdbynoone/sorter/releases/download/v${info.version}/${filename}`
    const tmpPath = join(app.getPath('temp'), filename)

    downloadDmgWithProgress(dmgUrl, tmpPath, (percent) => {
      notify({ phase: 'downloading', percent, version: info.version })
    })
      .then(async () => {
        notify({ phase: 'installing', version: info.version })
        await installFromDmg(tmpPath)
        notify({ phase: 'ready', version: info.version })
        setTimeout(() => { app.relaunch(); app.quit() }, 1500)
      })
      .catch(async (err: Error) => {
        notify({ phase: 'error', error: `Auto-install fallido, abriendo DMG: ${err.message}` })
        const desktopPath = join(homedir(), 'Desktop', filename)
        try { await downloadFile(dmgUrl, desktopPath); await shell.openPath(desktopPath) } catch {}
      })
  })

  autoUpdater.on('error', (err) => notify({ phase: 'error', error: err.message }))

  win.webContents.once('did-finish-load', () => autoUpdater.checkForUpdates())
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Status = 'unsorted' | 'keep' | 'maybe' | 'discard'

interface ImageEntry {
  path: string
  fingerprint: string
  status: Status
  rating: number
  categories: string[]
  note: string
  source: 'desktop' | 'folder' | 'drop'
  addedAt: number
  updatedAt: number
  missing?: boolean
}

interface Category {
  id: string
  name: string
  color?: string
  parentId?: string
  createdAt: number
}

interface SorterDB {
  version: 1
  entries: Record<string, ImageEntry>
  categories: Record<string, Category>
}

// ─── DB ───────────────────────────────────────────────────────────────────────

function dbPath(): string { return join(app.getPath('userData'), 'sorter-db.json') }
function thumbsDir(): string { return join(app.getPath('userData'), 'thumbs') }
function libraryDir(): string { return join(app.getPath('userData'), 'library') }

function copyToLibrary(srcPath: string): string {
  const dir = libraryDir()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const ext = extname(srcPath)
  const nameBase = basename(srcPath, ext)
  let destPath = join(dir, basename(srcPath))
  if (existsSync(destPath)) {
    const srcSize = statSync(srcPath).size
    if (statSync(destPath).size === srcSize) return destPath
    let i = 1
    while (existsSync(join(dir, `${nameBase}_${i}${ext}`))) i++
    destPath = join(dir, `${nameBase}_${i}${ext}`)
  }
  copyFileSync(srcPath, destPath)
  return destPath
}

function loadDB(): SorterDB {
  try {
    const raw = readFileSync(dbPath(), 'utf-8')
    return JSON.parse(raw)
  } catch {
    return { version: 1, entries: {}, categories: {} }
  }
}

let db: SorterDB = { version: 1, entries: {}, categories: {} }
let flushTimer: ReturnType<typeof setTimeout> | null = null

function scheduleFlush() {
  if (flushTimer) clearTimeout(flushTimer)
  flushTimer = setTimeout(flushDB, 250)
}

function flushDB() {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null }
  writeFileSync(dbPath(), JSON.stringify(db, null, 2), 'utf-8')
}

function uniqueId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

// ─── Preferences & Icons ─────────────────────────────────────────────────────

const ICON_STYLES = ['Default', 'Dark', 'ClearLight', 'ClearDark', 'TintedLight', 'TintedDark'] as const
type IconStyle = typeof ICON_STYLES[number]

interface SorterPrefs {
  iconStyle: IconStyle
  unlockedAt?: string
  authFailCount?: number
  authLockUntil?: number
}

function prefsPath(): string { return join(app.getPath('userData'), 'sorter-prefs.json') }

function loadPrefs(): SorterPrefs {
  try {
    return { iconStyle: 'Default', ...JSON.parse(readFileSync(prefsPath(), 'utf-8')) }
  } catch {
    return { iconStyle: 'Default' }
  }
}

function savePrefs(p: SorterPrefs) {
  writeFileSync(prefsPath(), JSON.stringify(p, null, 2), 'utf-8')
}

// ─── App lock ─────────────────────────────────────────────────────────────────
// Only the scrypt hash + salt live here — the passphrase itself is never
// written to source or to the compiled bundle, so reading/decompiling the app
// cannot recover it directly (only an offline brute-force against the hash).
const LOCK_SALT_HEX = 'a408bb9b2d0626e6991331a577c0667c'
const LOCK_HASH_HEX = '1cf870bd6f6b7117010d380b39963553c9bd7d823124c425da30ee0e9a41cef22320427f47e8835dd22465c1b35aa69b69d0ebe84e49f97f753a27c2c4184590'
const LOCK_HASH = Buffer.from(LOCK_HASH_HEX, 'hex')

let unlocked = false

function verifyPassphrase(attempt: string): boolean {
  const candidate = scryptSync(attempt, Buffer.from(LOCK_SALT_HEX, 'hex'), 64)
  return candidate.length === LOCK_HASH.length && timingSafeEqual(candidate, LOCK_HASH)
}

// Failed attempts + lockout persist across restarts (in prefs) so quitting
// and relaunching the app can't be used to reset a brute-force cooldown.
function currentLockout(): number {
  return loadPrefs().authLockUntil ?? 0
}

function registerFailedAttempt(): number {
  const prefs = loadPrefs()
  const count = (prefs.authFailCount ?? 0) + 1
  // Exponential backoff after the 3rd bad attempt: 5s, 10s, 20s, 40s ... capped at 5min
  const lockUntil = count >= 3
    ? Date.now() + Math.min(5000 * 2 ** (count - 3), 5 * 60 * 1000)
    : 0
  savePrefs({ ...prefs, authFailCount: count, authLockUntil: lockUntil })
  return lockUntil
}

function clearAuthState(): void {
  const prefs = loadPrefs()
  savePrefs({ ...prefs, authFailCount: 0, authLockUntil: 0, unlockedAt: new Date().toISOString() })
}

function requireUnlocked(): void {
  if (!unlocked) throw new Error('Locked')
}

// True only if `abs` resolves inside `root` (prefix startsWith is bypassable
// by sibling dirs like /thumbs-evil, and doesn't normalize `..`)
function isInside(root: string, abs: string): boolean {
  const rel = relative(root, abs)
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

// Every handler below requires the passphrase to have been entered once on
// this machine — without this, a renderer that skips the LockScreen UI
// (e.g. via devtools) still can't reach the db or filesystem.
function handleWhenUnlocked<Args extends unknown[], R>(
  channel: string,
  fn: (event: Electron.IpcMainInvokeEvent, ...args: Args) => R,
): void {
  ipcMain.handle(channel, (event, ...args: Args) => {
    requireUnlocked()
    return fn(event, ...args)
  })
}

function getIconPath(style: string): string {
  const filename = `Icon-macOS-${style}-1024@1x.png`
  if (app.isPackaged) return join(process.resourcesPath, 'icons', filename)
  return join(__dirname, '../../build/icons', filename)
}

function applyDockIcon(style: string) {
  if (process.platform !== 'darwin') return
  try {
    const icon = nativeImage.createFromPath(getIconPath(style))
    if (!icon.isEmpty()) app.dock.setIcon(icon)
  } catch {}
}

function buildAppMenu() {
  const prefs = loadPrefs()
  const iconSubmenu: Electron.MenuItemConstructorOptions[] = ICON_STYLES.map(style => ({
    label: style,
    type: 'radio' as const,
    checked: prefs.iconStyle === style,
    click: () => {
      savePrefs({ ...loadPrefs(), iconStyle: style })
      applyDockIcon(style)
      buildAppMenu()
    },
  }))
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.getName(),
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { label: 'App Icon', submenu: iconSubmenu },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' }, { role: 'zoom' },
        { type: 'separator' }, { role: 'front' },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ─── BMP Path Detection ───────────────────────────────────────────────────────

function getBmpOutputPath(): string {
  try {
    const bmpPrefsPath = join(homedir(), 'Library', 'Application Support', 'bmp', 'bmp-prefs.json')
    const raw = readFileSync(bmpPrefsPath, 'utf-8')
    const prefs = JSON.parse(raw)
    if (typeof prefs.outputPath === 'string' && prefs.outputPath.trim()) {
      const p = prefs.outputPath.trim()
      if (existsSync(p)) return p
    }
  } catch {}
  return join(homedir(), 'Desktop')
}

let watchPath = join(homedir(), 'Desktop') // updated after app.whenReady()

// ─── Brotherhood Default Categories ──────────────────────────────────────────

const BROTHERHOOD_CATEGORY_NAMES = [
  'Fisher Hats',
  'Caps',
  'Tees',
  'Hoodies',
  'Shorts',
  'Sweatpants',
  'Jackets',
  'Cultural Revelations',
  'Essentials',
]

function seedDefaultCategories() {
  if (Object.keys(db.categories).length > 0) return
  for (const name of BROTHERHOOD_CATEGORY_NAMES) {
    const id = uniqueId()
    db.categories[id] = { id, name, createdAt: Date.now() }
  }
  scheduleFlush()
}

// ─── Fingerprint & Reconciliation ─────────────────────────────────────────────

function fingerprint(p: string): string {
  try {
    const s = statSync(p)
    return `${s.size}:${Math.round(s.birthtimeMs)}`
  } catch { return '' }
}

const VIDEO_EXT = /\.(mp4|mov|webm|m4v)$/i
const MEDIA_EXT = /\.(jpe?g|png|webp|gif|mp4|mov|webm|m4v)$/i
const BMP_PATTERN = /^bmp_.*\.(jpe?g|png|webp|mp4|mov|webm)$/i

function isVideoPath(p: string): boolean {
  return VIDEO_EXT.test(p)
}

// localfile is registered `standard: true` (required for <video> to work at all — see
// protocol.handle below). Standard-scheme URL parsing collapses any number of leading
// slashes into an authority component, so `localfile:///Volumes/...` would parse "Volumes"
// as the host. A dummy host segment keeps the real absolute path intact in `url.pathname`.
function toLocalFileUrl(p: string): string {
  return `localfile://-${encodeURI(p)}`
}

const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.gif': 'image/gif',
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.m4v': 'video/x-m4v',
}
function mimeTypeFor(p: string): string {
  return MIME_TYPES[extname(p).toLowerCase()] ?? 'application/octet-stream'
}

function readByteRange(filePath: string, start: number, end: number): Buffer {
  const fd = openSync(filePath, 'r')
  try {
    const len = end - start + 1
    const buf = Buffer.alloc(len)
    readSync(fd, buf, 0, len, start)
    return buf
  } finally {
    closeSync(fd)
  }
}

function expandPaths(paths: string[]): string[] {
  const results: string[] = []
  for (const p of paths) {
    try {
      const s = statSync(p)
      if (s.isDirectory()) {
        readdirSync(p).forEach(f => {
          if (MEDIA_EXT.test(f)) results.push(join(p, f))
        })
      } else if (MEDIA_EXT.test(p)) {
        results.push(p)
      }
    } catch {}
  }
  return results
}

function reconcile(diskPaths: string[], source: ImageEntry['source']): ImageEntry[] {
  const fpToEntry = new Map<string, ImageEntry>()
  for (const entry of Object.values(db.entries)) {
    if (entry.fingerprint) fpToEntry.set(entry.fingerprint, entry)
  }

  const diskSet = new Set(diskPaths)
  const seenPaths = new Set<string>()
  const newEntries: ImageEntry[] = []

  for (const diskPath of diskPaths) {
    if (db.entries[diskPath]) {
      const entry = db.entries[diskPath]
      entry.fingerprint = fingerprint(diskPath)
      entry.missing = false
      seenPaths.add(diskPath)
    } else {
      const fp = fingerprint(diskPath)
      const existingByFp = fp ? fpToEntry.get(fp) : undefined
      if (existingByFp && !diskSet.has(existingByFp.path)) {
        const oldPath = existingByFp.path
        delete db.entries[oldPath]
        existingByFp.path = diskPath
        existingByFp.fingerprint = fp
        existingByFp.missing = false
        db.entries[diskPath] = existingByFp
        seenPaths.add(diskPath)
      } else {
        const entry: ImageEntry = {
          path: diskPath,
          fingerprint: fp,
          status: 'unsorted',
          rating: 0,
          categories: [],
          note: '',
          source,
          addedAt: Date.now(),
          updatedAt: Date.now(),
        }
        db.entries[diskPath] = entry
        newEntries.push(entry)
        seenPaths.add(diskPath)
      }
    }
  }

  for (const [path, entry] of Object.entries(db.entries)) {
    if (!seenPaths.has(path) && source === 'desktop' && entry.source === 'desktop') {
      entry.missing = !existsSync(path)
    }
  }

  scheduleFlush()

  return newEntries
}

// ─── Thumbnails ───────────────────────────────────────────────────────────────

function hashStr(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return Math.abs(h).toString(36)
}

let thumbQueue: Array<{ path: string; resolve: (v: string) => void }> = []
let activeThumbJobs = 0
const MAX_THUMB_CONCURRENCY = 8

function processThumbQueue() {
  while (activeThumbJobs < MAX_THUMB_CONCURRENCY && thumbQueue.length > 0) {
    const job = thumbQueue.shift()!
    activeThumbJobs++
    generateThumb(job.path)
      .then(result => { job.resolve(result) })
      .finally(() => { activeThumbJobs--; processThumbQueue() })
  }
}

// Hidden reusable window that decodes a video frame via <video>+<canvas> —
// avoids bundling a native ffmpeg binary (electron-builder cross-arch build
// only fetches the host's arch, which would break the arm64/x64 release pipeline).
let thumbWin: BrowserWindow | null = null
let videoThumbChain: Promise<unknown> = Promise.resolve()

async function getThumbWin(): Promise<BrowserWindow> {
  if (thumbWin && !thumbWin.isDestroyed()) return thumbWin
  // webSecurity: false is required for a data: page to load file:// media —
  // safe here because this window never navigates and never loads remote content.
  thumbWin = new BrowserWindow({ show: false, width: 320, height: 400, webPreferences: { sandbox: false, webSecurity: false } })
  await thumbWin.loadURL('data:text/html,<html><body></body></html>')
  return thumbWin
}

async function captureVideoFrame(p: string): Promise<Buffer | null> {
  try {
    const win = await getThumbWin()
    const fileUrl = JSON.stringify('file://' + encodeURI(p))
    const dataUrl = await win.webContents.executeJavaScript(`(function(){
      return new Promise((resolve, reject) => {
        const v = document.createElement('video')
        v.muted = true
        v.preload = 'auto'
        let done = false
        function capture() {
          if (done) return
          done = true
          try {
            const w = v.videoWidth || 400
            const h = v.videoHeight || 500
            const scale = Math.min(1, 400 / Math.max(w, h))
            const c = document.createElement('canvas')
            c.width = Math.round(w * scale)
            c.height = Math.round(h * scale)
            c.getContext('2d').drawImage(v, 0, 0, c.width, c.height)
            resolve(c.toDataURL('image/jpeg', 0.82))
          } catch (e) { reject(e) }
        }
        v.onloadeddata = () => { try { v.currentTime = Math.min(1, (v.duration || 2) / 3) } catch (e) { capture() } }
        v.onseeked = capture
        v.onerror = () => reject(new Error('video decode error'))
        v.src = ${fileUrl}
        setTimeout(() => { if (!done) capture() }, 4000)
      })
    })()`)
    if (typeof dataUrl !== 'string' || !dataUrl.includes(',')) return null
    return Buffer.from(dataUrl.split(',')[1], 'base64')
  } catch (e) {
    console.error('[Sorter] video thumb failed:', e)
    return null
  }
}

// Serialized — the hidden window's DOM can only decode one video at a time
function generateVideoThumb(p: string): Promise<Buffer | null> {
  const result = videoThumbChain.then(() => captureVideoFrame(p))
  videoThumbChain = result.catch(() => null)
  return result
}

async function generateThumb(p: string): Promise<string> {
  const dir = thumbsDir()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  const fp = db.entries[p]?.fingerprint || fingerprint(p)
  const key = hashStr(fp || p)
  const cachePath = join(dir, `${key}.jpg`)

  if (existsSync(cachePath)) return toLocalFileUrl(cachePath)

  if (isVideoPath(p)) {
    const frame = await generateVideoThumb(p)
    if (frame && frame.length > 0) {
      writeFileSync(cachePath, frame)
      return toLocalFileUrl(cachePath)
    }
    return ''
  }

  try {
    const img = nativeImage.createFromPath(p)
    if (!img.isEmpty()) {
      const { width, height } = img.getSize()
      const scale = Math.min(1, 400 / Math.max(width, height))
      const resized = scale < 1
        ? img.resize({ width: Math.round(width * scale), height: Math.round(height * scale), quality: 'good' })
        : img
      const jpeg = resized.toJPEG(72)
      if (jpeg.length > 0) {
        writeFileSync(cachePath, jpeg)
        return toLocalFileUrl(cachePath)
      }
    }
    const raw = readFileSync(p)
    writeFileSync(cachePath, raw)
    return toLocalFileUrl(cachePath)
  } catch {
    return toLocalFileUrl(p)
  }
}

function queueThumb(path: string): Promise<string> {
  return new Promise(resolve => {
    thumbQueue.push({ path, resolve })
    processThumbQueue()
  })
}

// ─── File Watcher ─────────────────────────────────────────────────────────────

let watcher: ReturnType<typeof fsWatch> | null = null
const pendingFiles = new Map<string, ReturnType<typeof setTimeout>>()
let mainWindow: BrowserWindow | null = null

function startWatcher() {
  if (watcher) { try { watcher.close() } catch {} }
  if (!existsSync(watchPath)) return

  watcher = fsWatch(watchPath, (event, filename) => {
    if (!filename || !BMP_PATTERN.test(filename)) return
    const fullPath = join(watchPath, filename)

    if (pendingFiles.has(filename)) clearTimeout(pendingFiles.get(filename)!)
    pendingFiles.set(filename, setTimeout(() => {
      pendingFiles.delete(filename)
      if (!existsSync(fullPath)) {
        if (db.entries[fullPath]) {
          db.entries[fullPath].missing = true
          scheduleFlush()
          mainWindow?.webContents.send('sorter:file-removed', fullPath)
        }
        return
      }

      let prev = -1
      let checks = 0
      const checkStable = () => {
        try {
          const size = statSync(fullPath).size
          if (size > 0 && size === prev) {
            const newEntries = reconcile([fullPath], 'desktop')
            if (newEntries.length > 0) {
              mainWindow?.webContents.send('sorter:file-added', newEntries[0])
            }
          } else {
            prev = size
            if (checks++ < 10) setTimeout(checkStable, 150)
          }
        } catch {}
      }
      setTimeout(checkStable, 150)
    }, 400))
  })
}

// ─── IPC — Auth (first-run lock screen) ──────────────────────────────────────
// Reachable even while locked — everything else below is gated on `unlocked`.
ipcMain.handle('auth:status', () => ({
  locked: !unlocked,
  lockUntil: currentLockout(),
}))

ipcMain.handle('auth:unlock', (_e, attempt: unknown) => {
  const lockUntil = currentLockout()
  if (Date.now() < lockUntil) return { ok: false, lockUntil }
  if (typeof attempt !== 'string' || !verifyPassphrase(attempt)) {
    return { ok: false, lockUntil: registerFailedAttempt() }
  }
  clearAuthState()
  unlocked = true
  bootData()
  return { ok: true, lockUntil: 0 }
})

// ─── IPC Handlers ─────────────────────────────────────────────────────────────

handleWhenUnlocked('sorter:get-db', () => db)

handleWhenUnlocked('sorter:get-bmp-path', () => watchPath)

handleWhenUnlocked('sorter:scan-desktop', () => {
  watchPath = getBmpOutputPath()
  try {
    const files = readdirSync(watchPath)
      .filter(f => BMP_PATTERN.test(f))
      .map(f => join(watchPath, f))
    reconcile(files, 'desktop')
    startWatcher()
  } catch {}
  return db
})

handleWhenUnlocked('sorter:import-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory'],
    message: 'Select a folder with generations',
  })
  if (result.canceled || !result.filePaths.length) return db
  const files = expandPaths([result.filePaths[0]])
  reconcile(files, 'folder')
  return db
})

handleWhenUnlocked('sorter:import-paths', (_event, paths: unknown) => {
  if (!Array.isArray(paths) || paths.length > 2000) return db
  const rawFiles = expandPaths(paths as string[])
  const lib = libraryDir()
  const files = rawFiles.map(p => {
    const managed = p.startsWith(watchPath) || p.startsWith(lib)
    return managed ? p : copyToLibrary(p)
  })
  reconcile(files, 'drop')
  return db
})

function mutateEntry(path: string, fn: (e: ImageEntry) => void): void {
  const entry = db.entries[path]
  if (!entry) return
  fn(entry)
  entry.updatedAt = Date.now()
  scheduleFlush()
}

const VALID_STATUSES: Status[] = ['unsorted', 'keep', 'maybe', 'discard']

handleWhenUnlocked('sorter:set-status', (_event, { path, status }: { path: string; status: Status }) => {
  if (typeof path !== 'string' || !VALID_STATUSES.includes(status)) return
  mutateEntry(path, e => { e.status = status })
})

handleWhenUnlocked('sorter:set-rating', (_event, { path, rating }: { path: string; rating: number }) => {
  if (typeof path !== 'string' || typeof rating !== 'number') return
  mutateEntry(path, e => { e.rating = Math.max(0, Math.min(5, Math.round(rating))) })
})

handleWhenUnlocked('sorter:set-note', (_event, { path, note }: { path: string; note: string }) => {
  if (typeof path !== 'string' || typeof note !== 'string' || note.length > 4000) return
  mutateEntry(path, e => { e.note = note })
})

handleWhenUnlocked('sorter:set-categories', (_event, { path, ids }: { path: string; ids: string[] }) => {
  if (typeof path !== 'string' || !Array.isArray(ids)) return
  mutateEntry(path, e => { e.categories = ids.filter(id => db.categories[id]) })
})

handleWhenUnlocked('sorter:add-category', (_event, { name, color, parentId }: { name: string; color?: string; parentId?: string }) => {
  if (typeof name !== 'string' || !name.trim() || name.length > 80) return db.categories
  if (parentId && !db.categories[parentId]) return db.categories
  const id = uniqueId()
  db.categories[id] = { id, name: name.trim(), color, parentId, createdAt: Date.now() }
  scheduleFlush()
  return db.categories
})

handleWhenUnlocked('sorter:rename-category', (_event, { id, name }: { id: string; name: string }) => {
  if (!db.categories[id] || typeof name !== 'string' || !name.trim()) return
  db.categories[id].name = name.trim()
  scheduleFlush()
})

handleWhenUnlocked('sorter:delete-category', (_event, id: unknown) => {
  if (typeof id !== 'string' || !db.categories[id]) return
  // Collect the target and all its children
  const idsToDelete = new Set([id, ...Object.keys(db.categories).filter(k => db.categories[k].parentId === id)])
  for (const deleteId of idsToDelete) delete db.categories[deleteId]
  for (const entry of Object.values(db.entries)) {
    entry.categories = entry.categories.filter(c => !idsToDelete.has(c))
  }
  scheduleFlush()
})

handleWhenUnlocked('sorter:get-thumb', (_event, path: unknown) => {
  if (typeof path !== 'string' || !db.entries[path]) return null
  return queueThumb(path)
})

// Native OS drag-out — lets the renderer hand a real file (original quality,
// no copy) to another app's drop target (e.g. dragging a render into BMP).
// Must resolve the icon synchronously: startDrag has to fire in direct
// response to the renderer's dragstart gesture, so we read whatever thumbnail
// is already cached on disk instead of generating one on demand.
ipcMain.on('sorter:drag-start', (event, path: unknown) => {
  if (typeof path !== 'string' || !db.entries[path]) return
  const fp = db.entries[path].fingerprint || fingerprint(path)
  const thumbPath = join(thumbsDir(), `${hashStr(fp || path)}.jpg`)
  let icon = existsSync(thumbPath) ? nativeImage.createFromPath(thumbPath) : nativeImage.createEmpty()
  if (icon.isEmpty()) icon = nativeImage.createFromPath(getIconPath(loadPrefs().iconStyle))
  if (icon.isEmpty()) return
  // Drag icon should be a small cursor-following affordance, not a full-size preview
  const { width, height } = icon.getSize()
  const scale = Math.min(1, 80 / Math.max(width, height))
  if (scale < 1) icon = icon.resize({ width: Math.round(width * scale), height: Math.round(height * scale) })
  event.sender.startDrag({ file: path, icon })
})

// Only act on files the app actually tracks — an arbitrary path here would
// let a compromised renderer open/reveal anything on disk
handleWhenUnlocked('sorter:reveal', (_event, path: unknown) => {
  if (typeof path !== 'string' || !db.entries[path]) return
  shell.showItemInFolder(path)
})

handleWhenUnlocked('sorter:open', (_event, path: unknown) => {
  if (typeof path !== 'string' || !db.entries[path]) return
  shell.openPath(path)
})

handleWhenUnlocked('sorter:purge-missing', () => {
  for (const [path, entry] of Object.entries(db.entries)) {
    if (entry.missing) delete db.entries[path]
  }
  scheduleFlush()
  return db
})

handleWhenUnlocked('sorter:trash-discarded', async () => {
  const discarded = Object.values(db.entries).filter(e => e.status === 'discard')

  // Remove already-gone entries from DB immediately
  for (const e of discarded) {
    if (!existsSync(e.path)) delete db.entries[e.path]
  }

  const toTrash = discarded.filter(e => existsSync(e.path))
  if (toTrash.length === 0) { scheduleFlush(); return db }

  // Correct trash directory per volume:
  // - internal / home drive → ~/.Trash/
  // - external volume (/Volumes/X/...) → /Volumes/X/.Trashes/<uid>/
  const uid = process.getuid?.() ?? 501
  function trashDirFor(filePath: string): string {
    const m = filePath.match(/^(\/Volumes\/[^/]+)\//)
    if (m) {
      const dir = join(m[1], '.Trashes', String(uid))
      try { mkdirSync(dir, { recursive: true }) } catch {}
      return dir
    }
    return join(homedir(), '.Trash')
  }

  function uniqueDest(dir: string, filename: string): string {
    let dest = join(dir, filename)
    if (!existsSync(dest)) return dest
    const dot = filename.lastIndexOf('.')
    const base = dot > 0 ? filename.slice(0, dot) : filename
    const ext  = dot > 0 ? filename.slice(dot) : ''
    let n = 1
    do { dest = join(dir, `${base}_${Date.now()}_${n++}${ext}`) } while (existsSync(dest))
    return dest
  }

  const trashOne = async (entry: ImageEntry): Promise<boolean> => {
    // Primary: shell.trashItem uses NSFileManager.trashItemAtURL — correct for all volumes
    try {
      await shell.trashItem(entry.path)
      return true
    } catch {}

    // Fallback: mv to volume-correct trash dir
    const filename = entry.path.split('/').pop()!
    const dir = trashDirFor(entry.path)
    const dest = uniqueDest(dir, filename)
    try {
      await execFileAsync('mv', [entry.path, dest], { env: shellEnv() })
      return true
    } catch {}

    // Last resort: osascript (5s timeout to prevent hang if Finder is busy)
    try {
      await execFileAsync('osascript', [
        '-e', `tell application "Finder" to delete POSIX file ${JSON.stringify(entry.path)}`
      ], { env: shellEnv(), timeout: 5000 })
      return true
    } catch {}

    // All methods failed — if file is already gone (race/external delete), still clean DB
    return !existsSync(entry.path)
  }

  const BATCH = 8
  for (let i = 0; i < toTrash.length; i += BATCH) {
    const batch = toTrash.slice(i, i + BATCH)
    const results = await Promise.allSettled(batch.map(e => trashOne(e)))
    results.forEach((r, j) => {
      if (r.status === 'fulfilled' && r.value) delete db.entries[batch[j].path]
    })
  }

  scheduleFlush()
  return db
})

// ─── Exporter ─────────────────────────────────────────────────────────────────

function getWatermarksPath(): string {
  if (app.isPackaged) return join(process.resourcesPath, 'watermarks')
  return join(__dirname, '../../build/watermarks')
}

handleWhenUnlocked('sorter:get-watermarks-path', () => getWatermarksPath())

handleWhenUnlocked('sorter:read-watermark', (_event, name: unknown) => {
  if (typeof name !== 'string') return null
  const p = join(getWatermarksPath(), `${name}.png`)
  if (!existsSync(p)) return null
  return `data:image/png;base64,${readFileSync(p).toString('base64')}`
})

handleWhenUnlocked('sorter:save-exports', async (_event, files: unknown) => {
  if (!Array.isArray(files) || files.length === 0) return { ok: false, error: 'No files' }
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory', 'createDirectory'],
    message: 'Seleccioná la carpeta de destino',
  })
  if (result.canceled || !result.filePaths.length) return { ok: false }
  const outDir = result.filePaths[0]
  const saved: string[] = []
  for (const f of files as Array<{ name: string; data: number[] }>) {
    if (typeof f.name !== 'string' || !Array.isArray(f.data)) continue
    const p = join(outDir, f.name)
    writeFileSync(p, Buffer.from(f.data))
    saved.push(p)
  }
  return { ok: true, files: saved }
})

handleWhenUnlocked('get-version', () => app.getVersion())

// ─── Window ───────────────────────────────────────────────────────────────────

// `standard: true` is required for <video>/<audio> to work at all through a custom
// protocol — without it Chromium's media pipeline rejects any response with
// MEDIA_ERR_SRC_NOT_SUPPORTED regardless of headers (confirmed against Electron 43;
// see electron/electron#51442). `stream: true` tells <video>/<audio> to expect a
// streamed/ranged response rather than a single buffered one.
protocol.registerSchemesAsPrivileged([
  { scheme: 'localfile', privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: true, corsEnabled: true, stream: true } },
])

// Scales the initial window to the display it opens on instead of a fixed
// 1100×780, so it looks right from a 13" laptop to an ultrawide/5K monitor.
// Bounds are chosen so a standard 1920×1080 screen lands ~1100×780 — same as
// the old hardcoded size — while smaller/larger screens get a proportional
// window instead of one that's oversized or cramped.
function initialWindowSize(): { width: number; height: number } {
  const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize
  const width = Math.round(Math.min(Math.max(screenW * 0.57, 920), 1320))
  const height = Math.round(Math.min(Math.max(screenH * 0.78, 600), 935))
  return { width, height }
}

function createWindow(): BrowserWindow {
  mainWindow = new BrowserWindow({
    ...initialWindowSize(),
    minWidth: 640,
    minHeight: 420,
    backgroundColor: '#0c0c0c',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: join(__dirname, '../preload/preload.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      // Was 1.1 (+10% UI) — now 0.95 (-5% off native), shrinking the whole
      // interface a bit further; window sizing above does the screen-adaptive
      // work a manual zoom hack used to approximate.
      zoomFactor: 0.95,
      // Hunspell dictionaries loaded by the spellchecker cost tens of MB for
      // a couple of short-lived text inputs — not worth it
      spellcheck: false,
    },
  })

  // webPreferences zoomFactor is unreliable on first load for non-default
  // values — enforce it once the page is up
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow?.webContents.setZoomFactor(0.95)
  })
  mainWindow.webContents.on('will-navigate', e => e.preventDefault())
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return mainWindow
}


// Only serve files this app actually tracks (or its own thumbnail cache) —
// without this check any renderer code (e.g. a compromised dependency) could
// fetch `localfile://` for an arbitrary path and read any file on disk that
// the OS user can access. Gated on `unlocked` too, same as every IPC handler.
function isServableLocalFile(filePath: string): boolean {
  if (!unlocked) return false
  if (db.entries[filePath]) return true
  return isInside(thumbsDir(), filePath)
}

// Runs once, right after unlock (or immediately at boot if already unlocked
// on this machine) — scanning the desktop before authentication would leak
// activity on an app nobody has unlocked yet.
function bootData(): void {
  db = loadDB()
  watchPath = getBmpOutputPath()
  seedDefaultCategories()

  try {
    const files = readdirSync(watchPath)
      .filter(f => BMP_PATTERN.test(f))
      .map(f => join(watchPath, f))
    reconcile(files, 'desktop')
  } catch {}

  setTimeout(() => {
    for (const entry of Object.values(db.entries)) {
      if (!entry.missing) queueThumb(entry.path)
    }
  }, 800)

  startWatcher()
}

app.whenReady().then(() => {
  protocol.handle('localfile', (request) => {
    // url.pathname (not naive slicing) — see toLocalFileUrl for why the dummy host exists
    const filePath = decodeURIComponent(new URL(request.url).pathname)
    if (!isServableLocalFile(filePath)) return new Response('Forbidden', { status: 403 })
    if (!existsSync(filePath)) return new Response('Not found', { status: 404 })

    const stat = statSync(filePath)
    const mimeType = mimeTypeFor(filePath)
    const range = request.headers.get('range')

    // net.fetch('file://...') ignores Range entirely and always returns 200 —
    // Chromium's <video>/<audio> then reject the response outright (error code 4)
    // since they sent a Range request and got back a non-206. Byte ranges must be
    // served manually.
    if (range) {
      const m = range.match(/^bytes=(\d*)-(\d*)$/)
      let start = m?.[1] ? parseInt(m[1], 10) : 0
      let end = m?.[2] ? parseInt(m[2], 10) : stat.size - 1
      if (m && m[1] === '' && m[2] !== '') {
        start = Math.max(0, stat.size - parseInt(m[2], 10)) // suffix range: bytes=-500
        end = stat.size - 1
      }
      end = Math.min(end, stat.size - 1)
      if (start >= stat.size || start > end) {
        return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${stat.size}` } })
      }
      const buf = readByteRange(filePath, start, end)
      return new Response(buf, {
        status: 206,
        headers: {
          'Content-Type': mimeType,
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': String(buf.length),
        },
      })
    }

    const buf = readByteRange(filePath, 0, stat.size - 1)
    return new Response(buf, {
      status: 200,
      headers: { 'Content-Type': mimeType, 'Accept-Ranges': 'bytes', 'Content-Length': String(buf.length) },
    })
  })

  unlocked = Boolean(loadPrefs().unlockedAt)

  buildAppMenu()
  applyDockIcon(loadPrefs().iconStyle)

  const win = createWindow()
  setupAutoUpdater(win)

  if (unlocked) bootData()
})

app.on('before-quit', () => {
  flushDB()
  if (thumbWin && !thumbWin.isDestroyed()) thumbWin.destroy()
})
app.on('window-all-closed', () => {
  flushDB()
  if (process.platform !== 'darwin') app.quit()
})
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
