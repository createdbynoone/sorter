import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import LockScreen from './components/LockScreen'
import { ImageCard } from './components/ImageCard'
import { ContextMenu } from './components/ContextMenu'
import { Inspector } from './components/Inspector'
import { FocusView } from './components/FocusView'
import { FilterBar, type SortKey, type FilterStatus } from './components/FilterBar'
import { DropOverlay } from './components/DropOverlay'
import { UpdateBar } from './components/UpdateBar'
import { ExporterPanel } from './components/ExporterPanel'
import { useKeyboard } from './hooks/useKeyboard'
import type { ImageEntry, Category, Status, SorterDB } from './env'

// ─── Footer ───────────────────────────────────────────────────────────────────

function Footer({ entries, version }: { entries: ImageEntry[]; version: string }) {
  const counts = useMemo(() => {
    const c = { keep: 0, maybe: 0, discard: 0, unsorted: 0, archived: 0 }
    for (const e of entries) c[e.status]++
    return c
  }, [entries])

  return (
    <div className="flex-shrink-0 border-t border-border px-5 py-2 flex items-center justify-between">
      <span className="text-[11.7px] text-text-muted font-mono tabular-nums">
        {entries.length} total
        {counts.keep > 0 && <> · <span className="text-[#5bb98c]/70">↑ {counts.keep} keep</span></>}
        {counts.maybe > 0 && <> · <span className="text-[#E8B547]/70">~ {counts.maybe} maybe</span></>}
        {counts.discard > 0 && <> · <span className="text-red-400/60">✕ {counts.discard} discard</span></>}
        {counts.unsorted > 0 && <> · <span className="text-text-muted">· {counts.unsorted} unsorted</span></>}
        {counts.archived > 0 && <> · <span className="text-[#6b8fb5]/70">⬒ {counts.archived} archived</span></>}
      </span>
      <span className="text-[11.7px] text-text-muted font-mono">Sorter {version && `v${version}`}</span>
    </div>
  )
}

// ─── TitleBar ─────────────────────────────────────────────────────────────────

function TitleBar({ onImport, onRescan, scanning, discardCount, onTrashDiscarded }: {
  onImport: () => void
  onRescan: () => void
  scanning: boolean
  discardCount: number
  onTrashDiscarded: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const cancelTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const startConfirm = () => {
    setConfirming(true)
    if (cancelTimer.current) clearTimeout(cancelTimer.current)
    cancelTimer.current = setTimeout(() => setConfirming(false), 3000)
  }
  const cancelConfirm = () => {
    setConfirming(false)
    if (cancelTimer.current) clearTimeout(cancelTimer.current)
  }
  const doTrash = () => {
    cancelConfirm()
    onTrashDiscarded()
  }

  return (
    <div className="titlebar-drag flex items-center justify-between gap-3 px-5 h-11 flex-shrink-0">
      <div className="titlebar-nodrag flex items-center gap-3 min-w-0 overflow-hidden translate-y-[1px]" style={{ marginLeft: '72px' }}>
        <span className="flex-shrink-0 font-heading font-bold text-base text-text-primary tracking-[0.15em] uppercase">Sorter</span>
        <span className="flex-shrink-0 text-text-muted text-xs hidden sm:inline">·</span>
        <span className="flex-shrink-0 text-text-secondary text-xs font-medium tracking-wide whitespace-nowrap hidden sm:inline">Generation Triage</span>
      </div>
      <div className="titlebar-nodrag flex items-center gap-2 flex-shrink-0">
        {discardCount > 0 && (
          <>
            {!confirming ? (
              <button
                onClick={startConfirm}
                className="text-[11.7px] text-red-400/50 hover:text-red-400 uppercase tracking-widest transition-colors flex items-center gap-1.5"
              >
                <svg width="9" height="10" viewBox="0 0 9 10" fill="none">
                  <path d="M1 2.5h7M3.5 2.5V1.5h2V2.5M2 2.5l.5 6h4l.5-6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Trash {discardCount}
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="text-[11.7px] font-mono text-red-400/70 uppercase tracking-widest">
                  Trash {discardCount}?
                </span>
                <button
                  onClick={doTrash}
                  className="px-2 py-0.5 rounded bg-red-500/20 border border-red-500/40 text-[11.7px] font-mono text-red-400 hover:bg-red-500/30 transition-colors"
                >
                  ✓
                </button>
                <button
                  onClick={cancelConfirm}
                  className="px-2 py-0.5 rounded bg-surface border border-border text-[11.7px] font-mono text-text-muted hover:text-text-secondary transition-colors"
                >
                  ✕
                </button>
              </div>
            )}
            <span className="text-border">·</span>
          </>
        )}
        <button
          onClick={onRescan}
          disabled={scanning}
          className="text-[11.7px] text-text-muted hover:text-text-secondary uppercase tracking-widest transition-colors disabled:opacity-40 flex items-center gap-1.5"
        >
          <svg className={scanning ? 'animate-spin' : ''} width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M9 5A4 4 0 1 1 5 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            <path d="M5 1l2 1.5L5 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Rescan
        </button>
        <span className="text-border">·</span>
        <button
          onClick={onImport}
          className="text-[11.7px] text-text-muted hover:text-text-secondary uppercase tracking-widest transition-colors"
        >
          Import folder
        </button>
      </div>
    </div>
  )
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [entries, setEntries] = useState<Record<string, ImageEntry>>({})
  const [categories, setCategories] = useState<Record<string, Category>>({})
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'grid' | 'focus'>('grid')
  const [filter, setFilter] = useState<FilterStatus>('all')
  const [sort, setSort] = useState<SortKey>('newest')
  const [search, setSearch] = useState('')
  const [scanning, setScanning] = useState(false)
  const [version, setVersion] = useState('')
  const [autoAdvance] = useState(true)
  const [newPaths, setNewPaths] = useState<Set<string>>(new Set())
  const [inspectorOpen, setInspectorOpen] = useState(true)
  const [focusNote, setFocusNote] = useState(false)
  const [gridSize, setGridSize] = useState(160)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [exportEntry, setExportEntry] = useState<ImageEntry | null>(null)
  const [contextMenu, setContextMenu] = useState<{ paths: string[]; x: number; y: number } | null>(null)
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
  const selectedPathsRef = useRef(selectedPaths); selectedPathsRef.current = selectedPaths
  const [marqueeRect, setMarqueeRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const marqueeStateRef = useRef<{ startX: number; startY: number; additive: boolean; baseSelection: Set<string> } | null>(null)
  const marqueeRafRef = useRef<number | null>(null)
  const gridContainerRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const [authState, setAuthState] = useState<'checking' | 'locked' | 'unlocked'>('checking')
  const [lockUntil, setLockUntil] = useState(0)

  useEffect(() => {
    window.sorter.auth.status().then(res => {
      if (res.locked) { setLockUntil(res.lockUntil); setAuthState('locked') }
      else setAuthState('unlocked')
    })
  }, [])

  // Boot — only once unlocked, so nothing scans the desktop before the
  // passphrase has been entered on this machine
  useEffect(() => {
    if (authState !== 'unlocked') return

    window.sorter.getDB().then(applyDB)
    window.sorter.getVersion().then(setVersion)

    const offAdded = window.sorter.onFileAdded((entry) => {
      setEntries(prev => ({ ...prev, [entry.path]: entry }))
      setNewPaths(prev => new Set(prev).add(entry.path))
      setTimeout(() => setNewPaths(prev => { const n = new Set(prev); n.delete(entry.path); return n }), 1200)
    })
    const offRemoved = window.sorter.onFileRemoved((path) => {
      setEntries(prev => {
        if (!prev[path]) return prev
        const next = { ...prev }
        next[path] = { ...next[path], missing: true }
        return next
      })
    })
    return () => { offAdded(); offRemoved() }
  }, [authState])

  function applyDB(db: SorterDB) {
    setEntries(db.entries)
    setCategories(db.categories)
  }

  // Filtered + sorted list
  const filteredEntries = useMemo<ImageEntry[]>(() => {
    let list = Object.values(entries)

    // 'all' hides archived on purpose — that's the point of archiving, keep already-used
    // renders out of the main triage view. They're only visible via the Archived tab.
    if (filter !== 'all') list = list.filter(e => e.status === filter)
    else list = list.filter(e => e.status !== 'archived')
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(e => e.path.toLowerCase().includes(q) || e.note.toLowerCase().includes(q))
    }

    list.sort((a, b) => {
      switch (sort) {
        case 'newest':  return b.addedAt - a.addedAt
        case 'oldest':  return a.addedAt - b.addedAt
        case 'status': {
          const order: Record<Status, number> = { keep: 0, maybe: 1, unsorted: 2, discard: 3, archived: 4 }
          return order[a.status] - order[b.status]
        }
        case 'name': return a.path.localeCompare(b.path)
        default: return 0
      }
    })
    return list
  }, [entries, filter, sort, search])

  const selectedIdx = selectedPath ? filteredEntries.findIndex(e => e.path === selectedPath) : -1
  const selectedEntry = selectedPath ? entries[selectedPath] ?? null : null

  // Two-level grouped view — only in All tab, no cat filter, no search
  type SubGroup = { id: string | null; name: string; entries: ImageEntry[] }
  type CatGroup = { id: string | null; name: string; count: number; subGroups: SubGroup[] }
  const groupedEntries = useMemo<CatGroup[] | null>(() => {
    if (filter !== 'all' || search.trim()) return null

    const parentCats = Object.values(categories).filter(c => !c.parentId).sort((a, b) => a.createdAt - b.createdAt)
    const childCats  = Object.values(categories).filter(c => !!c.parentId)
    const groups: CatGroup[] = []
    const assignedPaths = new Set<string>()

    for (const parent of parentCats) {
      // All entries that belong to this parent category
      const parentEntries = filteredEntries.filter(e => e.categories.includes(parent.id))
      if (parentEntries.length === 0) continue

      const subs = childCats.filter(c => c.parentId === parent.id).sort((a, b) => a.createdAt - b.createdAt)
      const subGroups: SubGroup[] = []
      const subAssigned = new Set<string>()

      for (const sub of subs) {
        const subEntries = parentEntries.filter(e => e.categories.includes(sub.id))
        if (subEntries.length > 0) {
          subEntries.forEach(e => subAssigned.add(e.path))
          subGroups.push({ id: sub.id, name: sub.name, entries: subEntries })
        }
      }

      // Entries with this parent but no subcategory assigned
      const noSub = parentEntries.filter(e => !subAssigned.has(e.path))
      if (noSub.length > 0) subGroups.push({ id: null, name: parent.name, entries: noSub })

      parentEntries.forEach(e => assignedPaths.add(e.path))
      groups.push({ id: parent.id, name: parent.name, count: parentEntries.length, subGroups })
    }

    const uncat = filteredEntries.filter(e => !assignedPaths.has(e.path))
    if (uncat.length > 0) {
      groups.push({ id: null, name: 'Sin categoría', count: uncat.length, subGroups: [{ id: null, name: 'Sin categoría', entries: uncat }] })
    }

    return groups.length > 0 ? groups : null
  }, [filter, search, filteredEntries, categories])

  // Counts
  const counts = useMemo(() => {
    const all = Object.values(entries)
    return {
      // Matches what the 'All' tab actually shows — archived is deliberately excluded there
      all: all.filter(e => e.status !== 'archived').length,
      unsorted: all.filter(e => e.status === 'unsorted').length,
      keep:     all.filter(e => e.status === 'keep').length,
      maybe:    all.filter(e => e.status === 'maybe').length,
      discard:  all.filter(e => e.status === 'discard').length,
      archived: all.filter(e => e.status === 'archived').length,
    }
  }, [entries])

  // Mutations (optimistic)
  const setStatus = useCallback((path: string, status: Status) => {
    setEntries(prev => prev[path] ? { ...prev, [path]: { ...prev[path], status, updatedAt: Date.now() } } : prev)
    window.sorter.setStatus(path, status)
  }, [])

  // Bulk-safe: archives everything unless the whole selection is already
  // archived, in which case it flips back to unsorted (so single-item right
  // click still behaves like the old toggle).
  const archiveMany = useCallback((paths: string[]) => {
    const allArchived = paths.every(p => entries[p]?.status === 'archived')
    const next: Status = allArchived ? 'unsorted' : 'archived'
    paths.forEach(p => setStatus(p, next))
  }, [entries, setStatus])

  const discardMany = useCallback((paths: string[]) => {
    const allDiscard = paths.every(p => entries[p]?.status === 'discard')
    const next: Status = allDiscard ? 'unsorted' : 'discard'
    paths.forEach(p => setStatus(p, next))
  }, [entries, setStatus])

  // Plain click selects just this card. ⌘/Ctrl-click toggles it in/out of the
  // selection. Shift-click extends a range from the current anchor (selectedPath)
  // to the clicked card, matching Finder — the anchor doesn't move on shift-click
  // so repeated shift-clicks keep expanding/contracting from the same origin.
  const handleCardClick = useCallback((e: React.MouseEvent, path: string) => {
    if (e.metaKey || e.ctrlKey) {
      setSelectedPaths(prev => {
        const next = new Set(prev)
        if (next.has(path)) next.delete(path); else next.add(path)
        return next
      })
      setSelectedPath(path)
      return
    }
    if (e.shiftKey && selectedPath) {
      const a = filteredEntries.findIndex(x => x.path === selectedPath)
      const b = filteredEntries.findIndex(x => x.path === path)
      if (a !== -1 && b !== -1) {
        const [lo, hi] = a < b ? [a, b] : [b, a]
        setSelectedPaths(new Set(filteredEntries.slice(lo, hi + 1).map(x => x.path)))
        return
      }
    }
    setSelectedPaths(new Set([path]))
    setSelectedPath(path)
  }, [selectedPath, filteredEntries])

  // Drag-select rectangle over empty grid space — same visual/intersection
  // behavior as Brotherhood Canvas's SelectionMode.Partial: a card is selected
  // the moment the rectangle merely touches it, not only when fully enclosed.
  const onGridMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    if (target.closest('[data-image-card]')) return
    e.preventDefault()

    const additive = e.shiftKey || e.metaKey || e.ctrlKey
    marqueeStateRef.current = {
      startX: e.clientX, startY: e.clientY, additive,
      baseSelection: additive ? new Set(selectedPathsRef.current) : new Set(),
    }
    setMarqueeRect({ x: e.clientX, y: e.clientY, w: 0, h: 0 })
    if (!additive) { setSelectedPaths(new Set()); setSelectedPath(null) }

    function onMove(ev: MouseEvent) {
      if (marqueeRafRef.current) return
      marqueeRafRef.current = requestAnimationFrame(() => {
        marqueeRafRef.current = null
        const m = marqueeStateRef.current
        if (!m) return
        const x = Math.min(m.startX, ev.clientX)
        const y = Math.min(m.startY, ev.clientY)
        const w = Math.abs(ev.clientX - m.startX)
        const h = Math.abs(ev.clientY - m.startY)
        setMarqueeRect({ x, y, w, h })

        const cards = gridContainerRef.current?.querySelectorAll<HTMLElement>('[data-image-card]')
        const touched = new Set(m.baseSelection)
        cards?.forEach(el => {
          const r = el.getBoundingClientRect()
          const intersects = r.left < x + w && r.right > x && r.top < y + h && r.bottom > y
          if (intersects) touched.add(el.dataset.path!)
        })
        setSelectedPaths(touched)
      })
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      marqueeStateRef.current = null
      setMarqueeRect(null)
      if (marqueeRafRef.current) { cancelAnimationFrame(marqueeRafRef.current); marqueeRafRef.current = null }
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [])

  // Right-clicking a card that's part of an active multi-selection keeps the
  // whole group as the menu target. Right-clicking anything else collapses
  // the selection down to just that card first — matches Brotherhood Canvas.
  const handleContextMenu = useCallback((e: React.MouseEvent, path: string) => {
    e.preventDefault()
    const current = selectedPathsRef.current
    const isPartOfMulti = current.size > 1 && current.has(path)
    if (!isPartOfMulti) {
      setSelectedPaths(new Set([path]))
      setSelectedPath(path)
    }
    setContextMenu({ paths: isPartOfMulti ? Array.from(current) : [path], x: e.clientX, y: e.clientY })
  }, [])

  const setNote = useCallback((path: string, note: string) => {
    setEntries(prev => prev[path] ? { ...prev, [path]: { ...prev[path], note, updatedAt: Date.now() } } : prev)
    window.sorter.setNote(path, note)
  }, [])

  const setCats = useCallback((path: string, ids: string[]) => {
    setEntries(prev => prev[path] ? { ...prev, [path]: { ...prev[path], categories: ids, updatedAt: Date.now() } } : prev)
    window.sorter.setCategories(path, ids)
  }, [])

  const addCategory = useCallback((name: string, parentId?: string) => {
    window.sorter.addCategory(name, parentId, undefined).then(cats => setCategories(cats))
  }, [])

  // Deleting a category cascades to its subcategories and strips the id from
  // every entry on the main-process side — refetch the whole DB rather than
  // hand-patching local state, so entries.categories stays in sync too.
  const deleteCategory = useCallback((id: string) => {
    window.sorter.deleteCategory(id).then(() => window.sorter.getDB()).then(applyDB)
  }, [])

  const handleImport = useCallback(() => {
    window.sorter.importFolder().then(applyDB)
  }, [])

  const handleRescan = useCallback(() => {
    setScanning(true)
    window.sorter.scanDesktop().then(db => { applyDB(db); setScanning(false) })
  }, [])

  const handleDropPaths = useCallback((paths: string[]) => {
    window.sorter.importPaths(paths).then(applyDB)
  }, [])

  const handleTrashDiscarded = useCallback(() => {
    window.sorter.trashDiscarded().then(db => {
      applyDB(db)
      setSelectedPath(prev => prev && db.entries[prev] ? prev : null)
    })
  }, [])

  // Grid keyboard nav
  useKeyboard({
    'ArrowUp': (e) => {
      e.preventDefault()
      if (viewMode !== 'grid') return
      const cols = Math.floor(document.querySelector('.image-grid')?.clientWidth ?? 0 / 168) || 5
      const idx = Math.max(0, selectedIdx - cols)
      setSelectedPath(filteredEntries[idx]?.path ?? null)
    },
    'ArrowDown': (e) => {
      e.preventDefault()
      if (viewMode !== 'grid') return
      const cols = Math.floor(document.querySelector('.image-grid')?.clientWidth ?? 0 / 168) || 5
      const idx = Math.min(filteredEntries.length - 1, selectedIdx + cols)
      setSelectedPath(filteredEntries[idx]?.path ?? null)
    },
    'ArrowLeft': (e) => {
      e.preventDefault()
      if (viewMode !== 'grid') return
      if (selectedIdx > 0) setSelectedPath(filteredEntries[selectedIdx - 1].path)
    },
    'ArrowRight': (e) => {
      e.preventDefault()
      if (viewMode !== 'grid') return
      if (selectedIdx < filteredEntries.length - 1) setSelectedPath(filteredEntries[selectedIdx + 1].path)
    },
    'Enter': () => { if (viewMode === 'grid' && selectedPath) { setFocusNote(false); setViewMode('focus') } },
    'f':     () => { if (viewMode === 'grid' && selectedPath) { setFocusNote(false); setViewMode('focus') } },
    'F':     () => { if (viewMode === 'grid' && selectedPath) { setFocusNote(false); setViewMode('focus') } },
    'k': () => { if (viewMode === 'grid' && selectedPath) setStatus(selectedPath, 'keep') },
    'K': () => { if (viewMode === 'grid' && selectedPath) setStatus(selectedPath, 'keep') },
    'm': () => { if (viewMode === 'grid' && selectedPath) setStatus(selectedPath, 'maybe') },
    'M': () => { if (viewMode === 'grid' && selectedPath) setStatus(selectedPath, 'maybe') },
    'd': () => { if (viewMode === 'grid' && selectedPath) setStatus(selectedPath, 'discard') },
    'D': () => { if (viewMode === 'grid' && selectedPath) setStatus(selectedPath, 'discard') },
    'u': () => { if (viewMode === 'grid' && selectedPath) setStatus(selectedPath, 'unsorted') },
    'U': () => { if (viewMode === 'grid' && selectedPath) setStatus(selectedPath, 'unsorted') },
    'a': () => { if (viewMode === 'grid' && selectedPath) setStatus(selectedPath, 'archived') },
    'A': () => { if (viewMode === 'grid' && selectedPath) setStatus(selectedPath, 'archived') },
    'n': () => { if (viewMode === 'grid' && selectedPath) { setFocusNote(true); if (!inspectorOpen) setInspectorOpen(true) } },
    'N': () => { if (viewMode === 'grid' && selectedPath) { setFocusNote(true); if (!inspectorOpen) setInspectorOpen(true) } },
    'r': () => { if (viewMode === 'grid' && selectedPath) window.sorter.revealInFinder(selectedPath) },
    'R': () => { if (viewMode === 'grid' && selectedPath) window.sorter.revealInFinder(selectedPath) },
    '/': (e) => { e.preventDefault(); searchRef.current?.focus() },
    'i': () => setInspectorOpen(o => !o),
    'I': () => setInspectorOpen(o => !o),
    '[': () => setGridSize(s => { const sizes = [120,160,220,300,400]; const i = sizes.indexOf(s); return i > 0 ? sizes[i-1] : s }),
    ']': () => setGridSize(s => { const sizes = [120,160,220,300,400]; const i = sizes.indexOf(s); return i < sizes.length-1 ? sizes[i+1] : s }),
    'cmd+a': (e) => { e.preventDefault(); setSelectedPaths(new Set(filteredEntries.map(x => x.path))) },
    'ctrl+a': (e) => { e.preventDefault(); setSelectedPaths(new Set(filteredEntries.map(x => x.path))) },
    'Escape': () => setSelectedPaths(prev => prev.size > 1 ? new Set() : prev),
  }, viewMode === 'grid')

  if (authState === 'checking') return null

  if (authState === 'locked') {
    return <LockScreen initialLockUntil={lockUntil} onUnlocked={() => setAuthState('unlocked')} />
  }

  return (
    <div className="flex flex-col h-screen bg-bg overflow-hidden">
      <TitleBar onImport={handleImport} onRescan={handleRescan} scanning={scanning} discardCount={counts.discard} onTrashDiscarded={handleTrashDiscarded} />
      <div className="h-px bg-border flex-shrink-0" />
      <UpdateBar />

      <FilterBar
        filter={filter} onFilter={setFilter}
        sort={sort} onSort={setSort}
        search={search} onSearch={setSearch}
        counts={counts}
        searchRef={searchRef}
        gridSize={gridSize} onGridSize={setGridSize}
      />

      {/* Main */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Grid — always full width; the Inspector floats on top of it */}
        <div
          ref={gridContainerRef}
          className="flex-1 overflow-y-auto p-3"
          onMouseDown={onGridMouseDown}
          onClick={e => { if (e.target === e.currentTarget) { setSelectedPaths(new Set()); setSelectedPath(null) } }}
        >
          {filteredEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <p className="text-[11.7px] text-text-muted font-mono uppercase tracking-[0.2em]">
                {Object.keys(entries).length === 0 ? 'Drop images, videos, or folders · Import · Auto-scans Desktop' : 'No images match filters'}
              </p>
            </div>
          ) : groupedEntries ? (
            <div className="flex flex-col gap-10">
              {groupedEntries.map(group => {
                const hasProducts = group.subGroups.some(s => s.id !== null)
                const groupKey = group.id ?? '__uncat'
                const collapsed = collapsedGroups.has(groupKey)
                const toggleCollapse = () => setCollapsedGroups(prev => {
                  const next = new Set(prev)
                  next.has(groupKey) ? next.delete(groupKey) : next.add(groupKey)
                  return next
                })
                return (
                  <div key={groupKey}>
                    {/* ── Category header ─────────────────────────────── */}
                    <button
                      onClick={toggleCollapse}
                      className="w-full flex items-center gap-3 mb-5 px-1 group text-left"
                    >
                      <span className="text-[12.7px] font-heading font-bold uppercase tracking-[0.22em] text-text-primary whitespace-nowrap group-hover:text-accent transition-colors">
                        {group.name}
                      </span>
                      <span className="text-[11.7px] font-mono text-text-muted tabular-nums">{group.count}</span>
                      {hasProducts && (
                        <span className="text-[11.7px] font-mono text-text-muted/50">
                          · {group.subGroups.filter(s => s.id !== null).length} producto{group.subGroups.filter(s => s.id !== null).length !== 1 ? 's' : ''}
                        </span>
                      )}
                      <div className="flex-1 h-px bg-border" />
                      <span className="text-[11.7px] font-mono text-text-muted/40 group-hover:text-text-muted transition-colors flex-shrink-0">
                        {collapsed ? '▸' : '▾'}
                      </span>
                    </button>

                    {/* ── Product subgroups ───────────────────────────── */}
                    {!collapsed && <div className="flex flex-col gap-6">
                      {group.subGroups.map(sub => (
                        <div key={sub.id ?? `${group.id}__nosub`}>
                          {/* Product sub-header — always shown when it has a real product id */}
                          {sub.id !== null && (
                            <div className="flex items-center gap-2 mb-2.5 px-1">
                              <span className="w-1 h-1 rounded-full bg-accent/60 flex-shrink-0" />
                              <span className="text-[11.7px] font-mono text-text-secondary uppercase tracking-widest whitespace-nowrap">
                                {sub.name}
                              </span>
                              <span className="text-[11.7px] font-mono text-text-muted/50 tabular-nums">{sub.entries.length}</span>
                              <div className="flex-1 h-px bg-border/30" />
                            </div>
                          )}
                          <div
                            className="image-grid grid gap-2"
                            style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${gridSize}px, 1fr))` }}
                          >
                            {sub.entries.map(entry => (
                              <ImageCard
                                key={entry.path}
                                entry={entry}
                                categories={categories}
                                selected={selectedPaths.has(entry.path)}
                                primary={entry.path === selectedPath}
                                isNew={newPaths.has(entry.path)}
                                onClick={(e) => handleCardClick(e, entry.path)}
                                onDoubleClick={() => { setSelectedPaths(new Set([entry.path])); setSelectedPath(entry.path); setViewMode('focus') }}
                                onContextMenu={(e) => handleContextMenu(e, entry.path)}
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>}
                  </div>
                )
              })}
            </div>
          ) : (
            <div
              className="image-grid grid gap-2"
              style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${gridSize}px, 1fr))` }}
            >
              {filteredEntries.map(entry => (
                <ImageCard
                  key={entry.path}
                  entry={entry}
                  categories={categories}
                  selected={selectedPaths.has(entry.path)}
                  primary={entry.path === selectedPath}
                  isNew={newPaths.has(entry.path)}
                  onClick={(e) => handleCardClick(e, entry.path)}
                  onDoubleClick={() => { setSelectedPaths(new Set([entry.path])); setSelectedPath(entry.path); setViewMode('focus') }}
                  onContextMenu={(e) => handleContextMenu(e, entry.path)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Inspector panel — floats over the grid with a frosted-glass blur, doesn't reflow it.
            z-20 so it (and its content) always paints above ImageCard's z-10 badges/hover overlay —
            without an explicit z-index here, those badges (z-10 > the panel's implicit z-auto/0)
            poked through the blur instead of being covered by it. */}
        <div
          className={`absolute top-0 right-0 bottom-0 z-20 w-[260px] border-l border-border bg-surface/80 backdrop-blur-xl shadow-2xl flex flex-col overflow-hidden transition-transform duration-300 ease-out ${
            inspectorOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <div className="px-4 py-3 border-b border-border flex-shrink-0 flex items-center justify-between">
            <span className="text-[11.7px] font-heading font-semibold uppercase tracking-widest text-text-secondary">Inspector</span>
            <button
              onClick={() => setInspectorOpen(false)}
              title="Close Inspector (I)"
              className="w-6 h-6 -mr-1 flex items-center justify-center rounded text-text-muted hover:text-text-secondary hover:bg-white/5 transition-colors text-sm"
            >
              ×
            </button>
          </div>
          <Inspector
            entry={selectedEntry}
            categories={categories}
            onStatus={setStatus}
            onNote={setNote}
            onCategories={setCats}
            onAddCategory={addCategory}
            onDeleteCategory={deleteCategory}
            onReveal={(p) => window.sorter.revealInFinder(p)}
            onOpen={(p) => window.sorter.openExternal(p)}
            focusNote={focusNote}
          />
        </div>

        {/* Inspector toggle — slides between the closed (right-2) and open (right-[272px])
            positions, chevron rotates to match. `fixed` (not `absolute`) so it's centered on
            the whole window height, not on Main's — Main's height shrinks ~36px whenever
            FilterBar wraps to a second row, which was dragging the old `absolute top-1/2`
            button down by half that (the "se baja" bug).
            `no-press-scale`: the global `button:active { transform: scale(0.96) }` tactile
            style (index.css) was the REAL cause of "se baja al hacer click" — it replaces
            this button's whole `transform`, wiping out the -translate-y-1/2 centering the
            instant you press it, so it visibly drops for the duration of the click. This
            class opts the button out of that rule so only the `right` slide animates.
            40px hit area (was 28px) for easier, more forgiving clicking. */}
        <button
          onClick={() => setInspectorOpen(o => !o)}
          title={inspectorOpen ? 'Close Inspector (I)' : 'Open Inspector (I)'}
          className={`no-press-scale fixed top-1/2 -translate-y-1/2 z-20 flex items-center justify-center w-10 h-10 rounded-full border border-border bg-surface/90 backdrop-blur-sm text-text-muted hover:text-text-primary hover:border-[#3d3d3d] shadow-lg transition-[right] duration-300 ease-out ${
            inspectorOpen ? 'right-[272px]' : 'right-2'
          }`}
        >
          <svg width="10" height="10" viewBox="0 0 9 9" fill="none" className={`transition-transform duration-300 ${inspectorOpen ? 'rotate-180' : ''}`}>
            <path d="M6 1.5L2.5 4.5L6 7.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* Drag-select rectangle — same visual as Brotherhood Canvas's marquee */}
      {marqueeRect && (marqueeRect.w > 2 || marqueeRect.h > 2) && (
        <div
          className="fixed z-40 pointer-events-none rounded"
          style={{
            left: marqueeRect.x, top: marqueeRect.y, width: marqueeRect.w, height: marqueeRect.h,
            background: 'rgba(232, 181, 71, 0.06)',
            border: '1px solid rgba(232, 181, 71, 0.4)',
          }}
        />
      )}

      <Footer entries={Object.values(entries)} version={version} />

      {/* Focus view overlay */}
      {viewMode === 'focus' && selectedIdx >= 0 && (
        <FocusView
          entries={filteredEntries}
          index={selectedIdx}
          categories={categories}
          onClose={() => setViewMode('grid')}
          onNavigate={(idx) => setSelectedPath(filteredEntries[idx]?.path ?? selectedPath)}
          onStatus={setStatus}
          onNote={setNote}
          onCategories={setCats}
          onAddCategory={addCategory}
          onDeleteCategory={deleteCategory}
          onReveal={(p) => window.sorter.revealInFinder(p)}
          onOpen={(p) => window.sorter.openExternal(p)}
          autoAdvance={autoAdvance}
          onExport={(e) => setExportEntry(e)}
        />
      )}

      <DropOverlay onPaths={handleDropPaths} />

      {exportEntry && (
        <ExporterPanel
          entry={exportEntry}
          onClose={() => setExportEntry(null)}
        />
      )}

      {contextMenu && contextMenu.paths.some(p => entries[p]) && (
        <ContextMenu
          entries={contextMenu.paths.map(p => entries[p]).filter(Boolean)}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onReveal={(p) => window.sorter.revealInFinder(p)}
          onOpen={(p) => window.sorter.openExternal(p)}
          onArchiveMany={archiveMany}
          onDiscardMany={discardMany}
        />
      )}
    </div>
  )
}
