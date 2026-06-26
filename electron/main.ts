import { app, BrowserWindow, ipcMain, shell, nativeImage, protocol, net, dialog, Menu } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync, createWriteStream } from 'fs'
import { watch as fsWatch } from 'fs'
import { homedir } from 'os'
import { execFile } from 'child_process'
import { promisify } from 'util'
import https from 'https'
import Anthropic from '@anthropic-ai/sdk'
import electronUpdater from 'electron-updater'
const { autoUpdater } = electronUpdater

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

interface SorterPrefs { iconStyle: IconStyle }

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

// Hardcoded seed catalog — merged with live data fetched from brotherhood.com.co
const BROTHERHOOD_CATALOG_SEED: Record<string, string[]> = {
  'Fisher Hats':         ['ORIGIN BLACK', 'ORIGIN BEIGE', 'MILITARY GRAY', 'MILITARY GREEN', 'ESSENCE BEIGE', 'ESSENCE BLACK'],
  'Caps':                ['98 KHAKI TRUCKER CAP', '1998 WHITE', 'BLACK CLOUD', 'BLACK SIDE', 'BLACKOUT', 'BLAME FACES BLACK', 'BLAME FACES GRAY', 'CREATIVE CROWN', 'GREEN FLAMES', 'HEAVEN', 'SUPER PRICE', 'TAG DENIM CAP', 'WHITE CLOUD', 'WHITEOUT'],
  'Tees':                ['1998 KHAKI OVERSIZED TEE', 'STARS WASHED BLACK OVERSIZED TEE', 'TAG GRAY OVERSIZED TEE'],
  'Hoodies':             ['1998 GRAY HOODIE'],
  'Shorts':              ['BEIGE DENIM SHORTS', 'BLACK DENIM SHORTS', 'KHAKI COTTON SHORTS'],
  'Sweatpants':          ['TAG GRAY SWEATPANTS'],
  'Jackets':             ['WORKING JACKET BEIGE', 'WORKING JACKET BLACK'],
  'Cultural Revelations':['BUCKY BEIGE', 'BUCKY BLACK', 'BUCKY GREEN'],
  'Essentials':          ['BH IDEALS BLACK', 'BH IDEALS WHITE', 'CLASSIC BLACK', 'CLASSIC DOG BLACK', 'CLASSIC DOG WHITE', 'OUTSIDE DOG BLACK'],
}

// Live catalog — seed + anything fetched from brotherhood.com.co at runtime
let liveCatalog: Record<string, string[]> = {}
let catalogRefreshing = false
let lastCatalogRefresh = 0

function catalogCachePath() { return join(app.getPath('userData'), 'brotherhood-catalog.json') }

function loadLiveCatalog() {
  // Deep-copy seed so runtime merges don't mutate the const
  liveCatalog = Object.fromEntries(Object.entries(BROTHERHOOD_CATALOG_SEED).map(([k, v]) => [k, [...v]]))
  try {
    const cached = JSON.parse(readFileSync(catalogCachePath(), 'utf-8')) as Record<string, string[]>
    for (const [cat, products] of Object.entries(cached)) {
      if (!liveCatalog[cat]) liveCatalog[cat] = []
      for (const p of products) {
        if (!liveCatalog[cat].includes(p)) liveCatalog[cat].push(p)
      }
    }
    console.log('[Sorter] Loaded catalog cache')
  } catch {}
}

// Fetches /products.json from Brotherhood's Shopify store and merges new products into liveCatalog.
// Returns true if any new products were added.
async function refreshCatalog(force = false): Promise<boolean> {
  if (catalogRefreshing) return false
  const INTERVAL = 12 * 60 * 60 * 1000 // re-fetch at most every 12h unless forced
  if (!force && Date.now() - lastCatalogRefresh < INTERVAL) return false

  catalogRefreshing = true
  try {
    console.log('[Sorter] Fetching product catalog from brotherhood.com.co...')
    const res = await net.fetch('https://www.brotherhood.com.co/products.json?limit=250')
    if (!res.ok) { console.warn(`[Sorter] Catalog fetch failed: HTTP ${res.status}`); return false }

    const json = await res.json() as { products: Array<{ title: string; product_type: string }> }
    let added = 0
    for (const product of json.products) {
      const cat = product.product_type?.trim()
      if (!cat) continue
      const name = product.title.trim().toUpperCase()
      if (!liveCatalog[cat]) liveCatalog[cat] = []
      if (!liveCatalog[cat].includes(name)) { liveCatalog[cat].push(name); added++ }
    }

    lastCatalogRefresh = Date.now()
    writeFileSync(catalogCachePath(), JSON.stringify(liveCatalog, null, 2))
    if (added > 0) console.log(`[Sorter] Catalog updated: +${added} new products`)
    else console.log('[Sorter] Catalog up to date')
    return added > 0
  } catch (e) {
    console.warn('[Sorter] Catalog refresh error:', e)
    return false
  } finally {
    catalogRefreshing = false
  }
}

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

// ─── Auto-classification (Claude Haiku vision) ────────────────────────────────

let anthropic: Anthropic | null = null

function initAnthropic() {
  let apiKey = process.env.ANTHROPIC_API_KEY

  // Fall back to ~/.bmp.env (same source BMP uses)
  if (!apiKey) {
    try {
      const raw = readFileSync(join(homedir(), '.bmp.env'), 'utf-8')
      const match = raw.match(/^ANTHROPIC_API_KEY=(.+)$/m)
      if (match) apiKey = match[1].trim()
    } catch {}
  }

  if (!apiKey) {
    console.warn('[Sorter] ANTHROPIC_API_KEY not found in env or ~/.bmp.env — auto-classify disabled')
    return
  }

  try {
    anthropic = new Anthropic({ apiKey })
    console.log('[Sorter] Anthropic client ready')
  } catch (e) {
    console.error('[Sorter] Anthropic init failed:', e)
  }
}

const classifyQueue: string[] = []
let classifyRunning = false

function enqueueForClassify(path: string) {
  const entry = db.entries[path]
  if (!entry || entry.missing || entry.categories.length > 0) return
  if (!classifyQueue.includes(path)) classifyQueue.push(path)
}

function queueAllUncategorized() {
  for (const entry of Object.values(db.entries)) {
    enqueueForClassify(entry.path)
  }
  if (classifyQueue.length > 0) {
    console.log(`[Sorter] Queued ${classifyQueue.length} images for auto-classification`)
    setTimeout(() => processClassifyQueue(), 1500)
  }
}

async function processClassifyQueue() {
  if (classifyRunning) return
  if (classifyQueue.length === 0) return
  if (!anthropic) { classifyQueue.length = 0; return }

  classifyRunning = true
  console.log(`[Sorter] Starting classification of ${classifyQueue.length} images`)
  while (classifyQueue.length > 0) {
    const path = classifyQueue.shift()!
    const entry = db.entries[path]
    if (!entry || entry.missing || entry.categories.length > 0) continue
    try {
      await autoClassifyEntry(entry)
    } catch (e) {
      console.error(`[Sorter] classify failed for ${path.split('/').pop()}:`, e)
    }
  }
  classifyRunning = false
  console.log('[Sorter] Classification queue done')
}

function buildCatalogLines(): string {
  return Object.values(db.categories)
    .filter(c => !c.parentId)
    .map(c => {
      const products = liveCatalog[c.name]
      return products?.length ? `${c.name}: ${products.join(', ')}` : c.name
    })
    .join('\n')
}

async function callHaikuClassify(base64: string, mediaType: string, catalogLines: string): Promise<{ typeStr: string; prodStr: string }> {
  const response = await anthropic!.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 80,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
        {
          type: 'text',
          text: `Classify this Brotherhood streetwear garment render using the exact product catalog below.\n${catalogLines}\n\nReply with exactly 2 lines, no extra text:\nCATEGORY: <category name from above>\nPRODUCT: <exact product name from that category's list>`,
        },
      ]
    }]
  })
  const text = (response.content[0] as { text: string }).text.trim()
  return {
    typeStr: text.match(/CATEGORY:\s*(.+)/i)?.[1].trim() ?? '',
    prodStr: text.match(/PRODUCT:\s*(.+)/i)?.[1].trim() ?? '',
  }
}

async function autoClassifyEntry(entry: ImageEntry): Promise<void> {
  if (!anthropic) return

  // Warm thumbnail cache — use resized thumb for faster API call
  await generateThumb(entry.path).catch(() => {})
  const key = hashStr(entry.fingerprint || entry.path)
  const cachePath = join(thumbsDir(), `${key}.jpg`)
  const imagePath = existsSync(cachePath) ? cachePath : entry.path

  const imageBytes = readFileSync(imagePath)
  const base64 = imageBytes.toString('base64')
  const mediaType = imagePath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg'
  const ignore = new Set(['other', 'unknown', 'n/a', 'none', ''])

  // ── First attempt ──────────────────────────────────────────────────────────
  let { typeStr, prodStr } = await callHaikuClassify(base64, mediaType, buildCatalogLines())
  console.log(`[Sorter] ${entry.path.split('/').pop()} → type:"${typeStr}" product:"${prodStr}"`)

  // Find the matched parent category
  let parentPair = Object.entries(db.categories).find(([_, c]) =>
    !c.parentId && (
      c.name.toLowerCase() === typeStr.toLowerCase() ||
      typeStr.toLowerCase().startsWith(c.name.toLowerCase()) ||
      c.name.toLowerCase().startsWith(typeStr.toLowerCase())
    )
  )
  if (!parentPair) return
  const [parentId, parentCat] = parentPair

  // Check if the returned product exists in the live catalog
  const catalogForCat = () => liveCatalog[parentCat.name] ?? []
  const findCatalogMatch = (s: string) => catalogForCat().find(p => p.toLowerCase() === s.toLowerCase())

  let catalogMatch = !ignore.has(prodStr.toLowerCase()) ? findCatalogMatch(prodStr) : undefined

  // ── If not found, refresh catalog from brotherhood.com.co and retry ────────
  if (!catalogMatch && !ignore.has(prodStr.toLowerCase())) {
    console.log(`[Sorter] "${prodStr}" not in catalog — refreshing from brotherhood.com.co`)
    const hadNew = await refreshCatalog(true)
    if (hadNew) {
      // Re-classify with the updated product list so Claude can match to new names
      const retry = await callHaikuClassify(base64, mediaType, buildCatalogLines())
      console.log(`[Sorter] retry → type:"${retry.typeStr}" product:"${retry.prodStr}"`)
      // Re-resolve parent in case category names changed
      parentPair = Object.entries(db.categories).find(([_, c]) =>
        !c.parentId && (
          c.name.toLowerCase() === retry.typeStr.toLowerCase() ||
          retry.typeStr.toLowerCase().startsWith(c.name.toLowerCase()) ||
          c.name.toLowerCase().startsWith(retry.typeStr.toLowerCase())
        )
      ) ?? parentPair
      prodStr = retry.prodStr
      catalogMatch = !ignore.has(prodStr.toLowerCase()) ? findCatalogMatch(prodStr) : undefined
    }
  }

  const [resolvedParentId] = parentPair
  const catIds = [resolvedParentId]

  // Assign subcategory — prefer exact catalog casing, fall back to Claude's text
  if (!ignore.has(prodStr.toLowerCase())) {
    const canonicalName = catalogMatch ?? prodStr
    const normName = canonicalName.toLowerCase()
    const existingSub = Object.entries(db.categories).find(([_, c]) =>
      c.parentId === resolvedParentId && c.name.toLowerCase() === normName
    )
    const subId = existingSub?.[0] ?? (() => {
      const id = uniqueId()
      db.categories[id] = { id, name: canonicalName, parentId: resolvedParentId, createdAt: Date.now() }
      return id
    })()
    catIds.push(subId)
  }

  mutateEntry(entry.path, e => { e.categories = catIds })
  mainWindow?.webContents.send('sorter:classified', db.entries[entry.path])
}

// ─── Fingerprint & Reconciliation ─────────────────────────────────────────────

function fingerprint(p: string): string {
  try {
    const s = statSync(p)
    return `${s.size}:${Math.round(s.birthtimeMs)}`
  } catch { return '' }
}

const IMAGE_EXT = /\.(jpe?g|png|webp|gif)$/i
const BMP_PATTERN = /^bmp_.*\.(jpe?g|png|webp)$/i

function expandPaths(paths: string[]): string[] {
  const results: string[] = []
  for (const p of paths) {
    try {
      const s = statSync(p)
      if (s.isDirectory()) {
        readdirSync(p).forEach(f => {
          if (IMAGE_EXT.test(f)) results.push(join(p, f))
        })
      } else if (IMAGE_EXT.test(p)) {
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
    if (!seenPaths.has(path) && source === 'desktop') {
      entry.missing = true
    }
  }

  scheduleFlush()

  // Queue new entries for background classification
  for (const entry of newEntries) enqueueForClassify(entry.path)
  if (newEntries.length > 0) setTimeout(() => processClassifyQueue(), 800)

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
const MAX_THUMB_CONCURRENCY = 4

function processThumbQueue() {
  while (activeThumbJobs < MAX_THUMB_CONCURRENCY && thumbQueue.length > 0) {
    const job = thumbQueue.shift()!
    activeThumbJobs++
    generateThumb(job.path)
      .then(result => { job.resolve(result) })
      .finally(() => { activeThumbJobs--; processThumbQueue() })
  }
}

async function generateThumb(p: string): Promise<string> {
  const dir = thumbsDir()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  const fp = db.entries[p]?.fingerprint || fingerprint(p)
  const key = hashStr(fp || p)
  const cachePath = join(dir, `${key}.jpg`)

  if (existsSync(cachePath)) return `localfile://${cachePath}`

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
        return `localfile://${cachePath}`
      }
    }
    const raw = readFileSync(p)
    writeFileSync(cachePath, raw)
    return `localfile://${cachePath}`
  } catch {
    return `localfile://${p}`
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
              enqueueForClassify(fullPath)
              setTimeout(() => processClassifyQueue(), 800)
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

// ─── IPC Handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('sorter:get-db', () => db)

ipcMain.handle('sorter:get-bmp-path', () => watchPath)

ipcMain.handle('sorter:scan-desktop', () => {
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

ipcMain.handle('sorter:import-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory'],
    message: 'Select a folder with generations',
  })
  if (result.canceled || !result.filePaths.length) return db
  const files = expandPaths([result.filePaths[0]])
  reconcile(files, 'folder')
  return db
})

ipcMain.handle('sorter:import-paths', (_event, paths: unknown) => {
  if (!Array.isArray(paths) || paths.length > 2000) return db
  const files = expandPaths(paths as string[])
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

ipcMain.handle('sorter:set-status', (_event, { path, status }: { path: string; status: Status }) => {
  if (typeof path !== 'string' || !VALID_STATUSES.includes(status)) return
  mutateEntry(path, e => { e.status = status })
})

ipcMain.handle('sorter:set-rating', (_event, { path, rating }: { path: string; rating: number }) => {
  if (typeof path !== 'string' || typeof rating !== 'number') return
  mutateEntry(path, e => { e.rating = Math.max(0, Math.min(5, Math.round(rating))) })
})

ipcMain.handle('sorter:set-note', (_event, { path, note }: { path: string; note: string }) => {
  if (typeof path !== 'string' || typeof note !== 'string' || note.length > 4000) return
  mutateEntry(path, e => { e.note = note })
})

ipcMain.handle('sorter:set-categories', (_event, { path, ids }: { path: string; ids: string[] }) => {
  if (typeof path !== 'string' || !Array.isArray(ids)) return
  mutateEntry(path, e => { e.categories = ids.filter(id => db.categories[id]) })
})

ipcMain.handle('sorter:add-category', (_event, { name, color, parentId }: { name: string; color?: string; parentId?: string }) => {
  if (typeof name !== 'string' || !name.trim() || name.length > 80) return db.categories
  if (parentId && !db.categories[parentId]) return db.categories
  const id = uniqueId()
  db.categories[id] = { id, name: name.trim(), color, parentId, createdAt: Date.now() }
  scheduleFlush()
  return db.categories
})

ipcMain.handle('sorter:rename-category', (_event, { id, name }: { id: string; name: string }) => {
  if (!db.categories[id] || typeof name !== 'string' || !name.trim()) return
  db.categories[id].name = name.trim()
  scheduleFlush()
})

ipcMain.handle('sorter:delete-category', (_event, id: unknown) => {
  if (typeof id !== 'string' || !db.categories[id]) return
  // Collect the target and all its children
  const idsToDelete = new Set([id, ...Object.keys(db.categories).filter(k => db.categories[k].parentId === id)])
  for (const deleteId of idsToDelete) delete db.categories[deleteId]
  for (const entry of Object.values(db.entries)) {
    entry.categories = entry.categories.filter(c => !idsToDelete.has(c))
  }
  scheduleFlush()
})

ipcMain.handle('sorter:get-thumb', (_event, path: unknown) => {
  if (typeof path !== 'string') return null
  return queueThumb(path)
})

ipcMain.handle('sorter:classify-image', async (_event, path: unknown) => {
  if (typeof path !== 'string' || !db.entries[path]) return
  const entry = db.entries[path]
  entry.categories = [] // reset so classify won't skip
  try {
    await autoClassifyEntry(entry)
  } catch (e) {
    console.error('[Sorter] Manual classify failed:', e)
  }
})

ipcMain.handle('sorter:reveal', (_event, path: unknown) => {
  if (typeof path !== 'string') return
  shell.showItemInFolder(path)
})

ipcMain.handle('sorter:open', (_event, path: unknown) => {
  if (typeof path !== 'string') return
  shell.openPath(path)
})

ipcMain.handle('sorter:purge-missing', () => {
  for (const [path, entry] of Object.entries(db.entries)) {
    if (entry.missing) delete db.entries[path]
  }
  scheduleFlush()
  return db
})

ipcMain.handle('get-version', () => app.getVersion())

// ─── Window ───────────────────────────────────────────────────────────────────

protocol.registerSchemesAsPrivileged([
  { scheme: 'localfile', privileges: { secure: true, supportFetchAPI: true, bypassCSP: true } },
])

function createWindow(): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 780,
    minWidth: 920,
    minHeight: 600,
    backgroundColor: '#0c0c0c',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: join(__dirname, '../preload/preload.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return mainWindow
}


app.whenReady().then(() => {
  protocol.handle('localfile', (request) => {
    const filePath = decodeURIComponent(request.url.slice('localfile://'.length))
    return net.fetch(`file://${filePath}`)
  })

  db = loadDB()
  loadLiveCatalog()
  watchPath = getBmpOutputPath()
  seedDefaultCategories()
  initAnthropic()
  buildAppMenu()
  applyDockIcon(loadPrefs().iconStyle)

  const win = createWindow()
  setupAutoUpdater(win)

  // Initial scan
  try {
    const files = readdirSync(watchPath)
      .filter(f => BMP_PATTERN.test(f))
      .map(f => join(watchPath, f))
    reconcile(files, 'desktop')
  } catch {}

  // Queue ALL uncategorized entries (including ones already in DB from previous sessions)
  queueAllUncategorized()

  // Background catalog refresh — keeps local cache warm, non-blocking
  refreshCatalog().catch(() => {})

  startWatcher()
})

app.on('before-quit', flushDB)
app.on('window-all-closed', () => {
  flushDB()
  if (process.platform !== 'darwin') app.quit()
})
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
