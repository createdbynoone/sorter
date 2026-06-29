import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { ImageCard } from './components/ImageCard'
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
    const c = { keep: 0, maybe: 0, discard: 0, unsorted: 0 }
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
      </span>
      <span className="text-[11.7px] text-text-muted font-mono">Sorter {version && `v${version}`}</span>
    </div>
  )
}

// ─── TitleBar ─────────────────────────────────────────────────────────────────

function TitleBar({ onImport, onRescan, scanning, bmpPath, discardCount, onTrashDiscarded }: {
  onImport: () => void
  onRescan: () => void
  scanning: boolean
  bmpPath: string
  discardCount: number
  onTrashDiscarded: () => void
}) {
  const shortPath = bmpPath ? bmpPath.replace(/^\/Users\/[^/]+\//, '~/') : ''
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
    <div className="titlebar-drag flex items-center justify-between px-5 pt-4 pb-3 flex-shrink-0">
      <div className="titlebar-nodrag flex items-center gap-3" style={{ marginLeft: '64px' }}>
        <span className="font-heading font-bold text-base text-text-primary tracking-[0.15em] uppercase">Sorter</span>
        <span className="text-text-muted text-xs">·</span>
        <span className="text-text-secondary text-xs font-medium tracking-wide">Generation Triage</span>
        {shortPath && (
          <>
            <span className="text-border text-xs">·</span>
            <span className="text-[11.7px] font-mono text-text-muted/60 truncate max-w-[280px]" title={bmpPath}>{shortPath}</span>
          </>
        )}
      </div>
      <div className="titlebar-nodrag flex items-center gap-2">
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
  const [bmpPath, setBmpPath] = useState('')
  const [gridSize, setGridSize] = useState(160)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [exportEntry, setExportEntry] = useState<ImageEntry | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  // Boot
  useEffect(() => {
    window.sorter.getDB().then(applyDB)
    window.sorter.getVersion().then(setVersion)
    window.sorter.getBmpPath().then(setBmpPath)

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
    const offClassified = window.sorter.onClassified((entry) => {
      setEntries(prev => ({ ...prev, [entry.path]: entry }))
      setCategories(prev => {
        // If a new category was created during auto-classify, refetch categories
        const catIds = entry.categories
        const unknownCat = catIds.some(id => !prev[id])
        if (unknownCat) {
          window.sorter.getDB().then(db => setCategories(db.categories))
        }
        return prev
      })
    })
    return () => { offAdded(); offRemoved(); offClassified() }
  }, [])

  function applyDB(db: SorterDB) {
    setEntries(db.entries)
    setCategories(db.categories)
  }

  // Filtered + sorted list
  const filteredEntries = useMemo<ImageEntry[]>(() => {
    let list = Object.values(entries)

    if (filter !== 'all') list = list.filter(e => e.status === filter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(e => e.path.toLowerCase().includes(q) || e.note.toLowerCase().includes(q))
    }

    list.sort((a, b) => {
      switch (sort) {
        case 'newest':  return b.addedAt - a.addedAt
        case 'oldest':  return a.addedAt - b.addedAt
        case 'rating':  return b.rating - a.rating
        case 'status': {
          const order: Record<Status, number> = { keep: 0, maybe: 1, unsorted: 2, discard: 3 }
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
      all: all.length,
      unsorted: all.filter(e => e.status === 'unsorted').length,
      keep:     all.filter(e => e.status === 'keep').length,
      maybe:    all.filter(e => e.status === 'maybe').length,
      discard:  all.filter(e => e.status === 'discard').length,
    }
  }, [entries])

  // Mutations (optimistic)
  const setStatus = useCallback((path: string, status: Status) => {
    setEntries(prev => prev[path] ? { ...prev, [path]: { ...prev[path], status, updatedAt: Date.now() } } : prev)
    window.sorter.setStatus(path, status)
  }, [])

  const setRating = useCallback((path: string, rating: number) => {
    setEntries(prev => prev[path] ? { ...prev, [path]: { ...prev[path], rating, updatedAt: Date.now() } } : prev)
    window.sorter.setRating(path, rating)
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
    '1': () => { if (viewMode === 'grid' && selectedPath) setRating(selectedPath, 1) },
    '2': () => { if (viewMode === 'grid' && selectedPath) setRating(selectedPath, 2) },
    '3': () => { if (viewMode === 'grid' && selectedPath) setRating(selectedPath, 3) },
    '4': () => { if (viewMode === 'grid' && selectedPath) setRating(selectedPath, 4) },
    '5': () => { if (viewMode === 'grid' && selectedPath) setRating(selectedPath, 5) },
    '0': () => { if (viewMode === 'grid' && selectedPath) setRating(selectedPath, 0) },
    'n': () => { if (viewMode === 'grid' && selectedPath) { setFocusNote(true); if (!inspectorOpen) setInspectorOpen(true) } },
    'N': () => { if (viewMode === 'grid' && selectedPath) { setFocusNote(true); if (!inspectorOpen) setInspectorOpen(true) } },
    'r': () => { if (viewMode === 'grid' && selectedPath) window.sorter.revealInFinder(selectedPath) },
    'R': () => { if (viewMode === 'grid' && selectedPath) window.sorter.revealInFinder(selectedPath) },
    '/': (e) => { e.preventDefault(); searchRef.current?.focus() },
    'i': () => setInspectorOpen(o => !o),
    'I': () => setInspectorOpen(o => !o),
    '[': () => setGridSize(s => { const sizes = [120,160,220,300,400]; const i = sizes.indexOf(s); return i > 0 ? sizes[i-1] : s }),
    ']': () => setGridSize(s => { const sizes = [120,160,220,300,400]; const i = sizes.indexOf(s); return i < sizes.length-1 ? sizes[i+1] : s }),
  }, viewMode === 'grid')

  return (
    <div className="flex flex-col h-screen bg-bg overflow-hidden">
      <TitleBar onImport={handleImport} onRescan={handleRescan} scanning={scanning} bmpPath={bmpPath} discardCount={counts.discard} onTrashDiscarded={handleTrashDiscarded} />
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
      <div className="flex-1 flex overflow-hidden">
        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-3">
          {filteredEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <p className="text-[11.7px] text-text-muted font-mono uppercase tracking-[0.2em]">
                {Object.keys(entries).length === 0 ? 'Drop images or folders · Import · Auto-scans Desktop' : 'No images match filters'}
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
                                selected={entry.path === selectedPath}
                                isNew={newPaths.has(entry.path)}
                                onClick={() => setSelectedPath(entry.path)}
                                onDoubleClick={() => { setSelectedPath(entry.path); setViewMode('focus') }}
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
                  selected={entry.path === selectedPath}
                  isNew={newPaths.has(entry.path)}
                  onClick={() => setSelectedPath(entry.path)}
                  onDoubleClick={() => { setSelectedPath(entry.path); setViewMode('focus') }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Inspector panel */}
        {inspectorOpen && (
          <div className="w-[240px] flex-shrink-0 border-l border-border flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex-shrink-0 flex items-center justify-between">
              <span className="text-[11.7px] font-heading font-semibold uppercase tracking-widest text-text-secondary">Inspector</span>
              <button onClick={() => setInspectorOpen(false)} className="text-text-muted hover:text-text-secondary text-xs transition-colors">×</button>
            </div>
            <Inspector
              entry={selectedEntry}
              categories={categories}
              onStatus={setStatus}
              onRating={setRating}
              onNote={setNote}
              onCategories={setCats}
              onAddCategory={addCategory}
              onReveal={(p) => window.sorter.revealInFinder(p)}
              onOpen={(p) => window.sorter.openExternal(p)}
              onClassify={(p) => window.sorter.classifyImage(p)}
              focusNote={focusNote}
            />
          </div>
        )}

        {/* Inspector toggle when closed */}
        {!inspectorOpen && (
          <button
            onClick={() => setInspectorOpen(true)}
            className="flex-shrink-0 flex items-center justify-center w-6 border-l border-border bg-surface hover:bg-[#141414] transition-colors"
            title="Open Inspector (I)"
          >
            <span className="text-[11.7px] text-text-muted rotate-90 font-mono tracking-widest uppercase">Inspector</span>
          </button>
        )}
      </div>

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
          onRating={setRating}
          onNote={setNote}
          onCategories={setCats}
          onAddCategory={addCategory}
          onReveal={(p) => window.sorter.revealInFinder(p)}
          onOpen={(p) => window.sorter.openExternal(p)}
          onClassify={(p) => window.sorter.classifyImage(p)}
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
    </div>
  )
}
