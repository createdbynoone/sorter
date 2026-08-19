import React, { useState, useEffect, useRef, useCallback } from 'react'
import { StatusPill } from './StatusBadge'
import { isVideoPath, toLocalFileUrl } from '../utils/media'
import type { ImageEntry, Category, Status } from '../env'

interface Props {
  entry: ImageEntry | null
  categories: Record<string, Category>
  onStatus: (path: string, s: Status) => void
  onNote: (path: string, n: string) => void
  onCategories: (path: string, ids: string[]) => void
  onAddCategory: (name: string, parentId?: string) => void
  onDeleteCategory: (id: string) => void
  onReveal: (path: string) => void
  onOpen: (path: string) => void
  focusNote?: boolean
}

const STATUSES: Status[] = ['keep', 'maybe', 'discard', 'archived', 'unsorted']

export function Inspector({ entry, categories, onStatus, onNote, onCategories, onAddCategory, onDeleteCategory, onReveal, onOpen, focusNote }: Props) {
  const [noteValue, setNoteValue] = useState('')
  const [newCatName, setNewCatName] = useState('')
  const [addingCat, setAddingCat] = useState(false)
  const [addingCatParentId, setAddingCatParentId] = useState<string | undefined>(undefined)
  const [resolution, setResolution] = useState<string>('')
  const [catCtxMenu, setCatCtxMenu] = useState<{ id: string; name: string; x: number; y: number } | null>(null)
  const [confirmDeleteCat, setConfirmDeleteCat] = useState(false)
  const catCtxRef = useRef<HTMLDivElement>(null)
  const noteRef = useRef<HTMLTextAreaElement>(null)
  const newCatRef = useRef<HTMLInputElement>(null)

  const openCatCtxMenu = useCallback((e: React.MouseEvent, cat: Category) => {
    e.preventDefault()
    e.stopPropagation()
    setConfirmDeleteCat(false)
    setCatCtxMenu({ id: cat.id, name: cat.name, x: e.clientX, y: e.clientY })
  }, [])

  useEffect(() => {
    if (!catCtxMenu) return
    function onDown(e: MouseEvent) {
      if (catCtxRef.current && !catCtxRef.current.contains(e.target as Node)) setCatCtxMenu(null)
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setCatCtxMenu(null) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [catCtxMenu])

  useEffect(() => {
    if (!entry) { setResolution(''); return }
    setResolution('')
    if (isVideoPath(entry.path)) {
      const video = document.createElement('video')
      video.onloadedmetadata = () => {
        const mins = Math.floor(video.duration / 60)
        const secs = Math.round(video.duration % 60).toString().padStart(2, '0')
        setResolution(`${video.videoWidth} × ${video.videoHeight} · ${mins}:${secs}`)
      }
      video.onerror = () => setResolution('')
      video.src = toLocalFileUrl(entry.path)
      return
    }
    const img = new Image()
    img.onload = () => setResolution(`${img.naturalWidth} × ${img.naturalHeight}`)
    img.onerror = () => setResolution('')
    img.src = toLocalFileUrl(entry.path)
  }, [entry?.path])

  useEffect(() => {
    setNoteValue(entry?.note ?? '')
  }, [entry?.path])

  // Debounced note save
  useEffect(() => {
    if (!entry || noteValue === entry.note) return
    const t = setTimeout(() => onNote(entry.path, noteValue), 400)
    return () => clearTimeout(t)
  }, [noteValue])

  useEffect(() => {
    if (focusNote) noteRef.current?.focus()
  }, [focusNote])

  // One category + one product per image — a category/product click always
  // REPLACES whatever was selected at that level (radio behavior), instead of
  // accumulating into a checkbox list. That accumulation was the actual bug:
  // clicking a second parent category didn't switch to it, it just added a
  // second active category on top of the first.
  const toggleCat = useCallback((id: string) => {
    if (!entry) return
    const cat = categories[id]
    if (!cat) return
    const isParent = !cat.parentId
    let ids: string[]

    if (isParent) {
      const currentParent = entry.categories.find(cid => categories[cid] && !categories[cid].parentId)
      // Clicking the already-active category deselects it (and its product,
      // since products are scoped to a category). Clicking a different one
      // switches to it, dropping the old category and its product.
      ids = currentParent === id ? [] : [id]
    } else {
      const parentId = entry.categories.find(cid => categories[cid] && !categories[cid].parentId) ?? cat.parentId
      const currentSub = entry.categories.find(cid => categories[cid]?.parentId === cat.parentId)
      ids = currentSub === id ? [parentId] : [parentId, id]
    }
    onCategories(entry.path, ids)
  }, [entry, categories, onCategories])

  const handleAddCat = useCallback(() => {
    const name = newCatName.trim()
    if (!name) { setAddingCat(false); setAddingCatParentId(undefined); return }
    onAddCategory(name, addingCatParentId)
    setNewCatName('')
    setAddingCat(false)
    setAddingCatParentId(undefined)
  }, [newCatName, addingCatParentId, onAddCategory])

  useEffect(() => {
    if (addingCat) setTimeout(() => newCatRef.current?.focus(), 50)
  }, [addingCat])

  if (!entry) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 px-4">
        <p className="text-[11.7px] text-text-muted font-mono uppercase tracking-widest text-center">
          Select an image to inspect
        </p>
      </div>
    )
  }

  const filename = entry.path.split('/').pop() ?? entry.path
  const date = new Date(entry.addedAt).toLocaleDateString('es-CO', { month: 'short', day: 'numeric', year: 'numeric' })

  return (
    <>
    <div className="flex flex-col gap-4 p-4 overflow-y-auto h-full">
      {/* File info */}
      <div className="flex flex-col gap-1">
        <p className="text-[11.7px] font-mono text-text-primary break-all leading-relaxed selectable">{filename}</p>
        {resolution && (
          <span className="text-[11.7px] font-mono text-text-muted tabular-nums">{resolution}{isVideoPath(entry.path) ? '' : ' px'}</span>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11.7px] font-mono text-text-muted">{date}</span>
          <span className="text-[11.7px] font-mono text-text-muted/50 px-1 py-0.5 border border-border rounded">{entry.source}</span>
          {entry.missing && <span className="text-[11.7px] font-mono text-red-400/70 border border-red-500/20 px-1 py-0.5 rounded">missing</span>}
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-border" />

      {/* Status */}
      <div className="flex flex-col gap-2">
        <span className="text-[11.7px] font-heading font-semibold uppercase tracking-widest text-text-secondary">Status</span>
        <div className="flex flex-wrap gap-1.5">
          {STATUSES.map(s => (
            <StatusPill key={s} status={s} active={entry.status === s} onClick={() => onStatus(entry.path, s)} />
          ))}
        </div>
      </div>

      <div className="h-px bg-border" />

      {/* Note */}
      <div className="flex flex-col gap-2">
        <span className="text-[11.7px] font-heading font-semibold uppercase tracking-widest text-text-secondary">Notes</span>
        <textarea
          ref={noteRef}
          value={noteValue}
          onChange={e => setNoteValue(e.target.value)}
          placeholder="Anotar cambios, ideas..."
          rows={4}
          className="w-full bg-[#141414] border border-border rounded-lg px-3 py-2 text-xs font-mono text-text-primary placeholder:text-text-muted leading-relaxed focus:outline-none focus:border-[#3d3d3d] transition-colors"
        />
      </div>

      {/* Categories — two levels */}
      {(() => {
        const parentCats = Object.values(categories).filter(c => !c.parentId).sort((a, b) => a.createdAt - b.createdAt)
        const childCats  = Object.values(categories).filter(c => !!c.parentId)
        // Find active parent (first assigned parent category)
        const activeParentId = entry.categories.find(id => categories[id] && !categories[id].parentId)
        const activeSubs = entry.categories.filter(id => categories[id]?.parentId)

        return (
          <div className="flex flex-col gap-3">
            {/* Parent categories */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11.7px] font-heading font-semibold uppercase tracking-widest text-text-secondary">Category</span>
                <button
                  onClick={() => { setAddingCat(true); setAddingCatParentId(undefined) }}
                  title="New category"
                  className="w-4 h-4 flex-shrink-0 flex items-center justify-center rounded border border-dashed border-border text-text-muted hover:border-accent/50 hover:text-accent transition-all duration-150 leading-none"
                >
                  +
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {parentCats.map(cat => {
                  const active = entry.categories.includes(cat.id)
                  return (
                    <button key={cat.id} onClick={() => toggleCat(cat.id)} onContextMenu={e => openCatCtxMenu(e, cat)}
                      className={`px-2 py-1 rounded-md text-[11.7px] font-mono uppercase border transition-all duration-150
                        ${active ? 'border-accent/50 bg-accent/10 text-accent' : 'border-border text-text-muted hover:border-[#3d3d3d] hover:text-text-secondary'}`}>
                      {cat.name}
                    </button>
                  )
                })}
                {addingCat && !addingCatParentId && (
                  <input ref={newCatRef} value={newCatName}
                    onChange={e => setNewCatName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleAddCat(); if (e.key === 'Escape') { setAddingCat(false); setNewCatName('') } }}
                    onBlur={handleAddCat} placeholder="New category..."
                    className="px-2 py-1 rounded-md text-[11.7px] font-mono border border-accent/40 bg-accent/5 text-text-primary placeholder:text-text-muted focus:outline-none w-28" />
                )}
              </div>
            </div>

            {/* Subcategories — shown under active parent */}
            {activeParentId && (() => {
              const subs = childCats.filter(c => c.parentId === activeParentId).sort((a, b) => a.createdAt - b.createdAt)
              return (
                <div className="flex flex-col gap-1.5 pl-2 border-l border-border/50">
                  <div className="flex items-center justify-between">
                    <span className="text-[11.7px] font-mono uppercase tracking-widest text-accent/60">Product</span>
                    <button
                      onClick={() => { setAddingCat(true); setAddingCatParentId(activeParentId) }}
                      title="New product"
                      className="w-4 h-4 flex-shrink-0 flex items-center justify-center rounded border border-dashed border-border/60 text-text-muted hover:border-accent/50 hover:text-accent transition-all duration-150 leading-none"
                    >
                      +
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {subs.map(cat => {
                      const active = activeSubs.includes(cat.id)
                      return (
                        <button key={cat.id} onClick={() => toggleCat(cat.id)} onContextMenu={e => openCatCtxMenu(e, cat)}
                          className={`px-2 py-0.5 rounded text-[11.7px] font-mono uppercase border transition-all duration-150
                            ${active ? 'border-accent/40 bg-accent/8 text-accent/80' : 'border-border/60 text-text-muted hover:border-[#3d3d3d] hover:text-text-secondary'}`}>
                          {cat.name}
                        </button>
                      )
                    })}
                    {addingCat && addingCatParentId === activeParentId && (
                      <input ref={newCatRef} value={newCatName}
                        onChange={e => setNewCatName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleAddCat(); if (e.key === 'Escape') { setAddingCat(false); setNewCatName(''); setAddingCatParentId(undefined) } }}
                        onBlur={handleAddCat} placeholder="New product..."
                        className="px-2 py-0.5 rounded text-[11.7px] font-mono border border-accent/40 bg-accent/5 text-text-primary placeholder:text-text-muted focus:outline-none w-28" />
                    )}
                  </div>
                </div>
              )
            })()}
          </div>
        )
      })()}

      <div className="h-px bg-border" />

      {/* Actions */}
      <div className="flex flex-col gap-1.5">
        <button
          onClick={() => onReveal(entry.path)}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-[11.7px] font-heading font-semibold uppercase tracking-widest text-text-secondary hover:border-[#3d3d3d] hover:text-text-primary transition-all duration-150"
        >
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <path d="M1 5.5h9M6.5 2l3.5 3.5-3.5 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Reveal in Finder
        </button>
        <button
          onClick={() => onOpen(entry.path)}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-[11.7px] font-heading font-semibold uppercase tracking-widest text-text-secondary hover:border-[#3d3d3d] hover:text-text-primary transition-all duration-150"
        >
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <path d="M2 2h7v7M2 9l7-7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Open in Preview
        </button>
      </div>
    </div>

    {/* Floating delete menu — right-click a category/product chip */}
    {catCtxMenu && (
      <div
        ref={catCtxRef}
        style={{ left: catCtxMenu.x, top: catCtxMenu.y }}
        className="fixed z-50 w-[168px] flex flex-col gap-1 p-1.5 rounded-xl border border-border bg-surface/80 backdrop-blur-xl shadow-2xl animate-menu-in"
      >
        <button
          onClick={() => {
            if (!confirmDeleteCat) { setConfirmDeleteCat(true); return }
            onDeleteCategory(catCtxMenu.id)
            setCatCtxMenu(null)
            setConfirmDeleteCat(false)
          }}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[11.7px] font-heading font-semibold uppercase tracking-widest transition-all duration-150 ${
            confirmDeleteCat ? 'text-red-300 bg-red-500/15 hover:bg-red-500/25' : 'text-red-400 hover:bg-red-500/10'
          }`}
        >
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" className="flex-shrink-0">
            <path d="M1 2.5h9M3.5 2.5V1.5h4V2.5M2 2.5l.5 7h6l.5-7" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {confirmDeleteCat ? 'Confirm delete?' : `Delete "${catCtxMenu.name}"`}
        </button>
      </div>
    )}
    </>
  )
}
