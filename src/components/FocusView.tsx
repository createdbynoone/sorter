import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Inspector } from './Inspector'
import { StatusBadge } from './StatusBadge'
import { useKeyboard } from '../hooks/useKeyboard'
import type { ImageEntry, Category, Status } from '../env'

interface Props {
  entries: ImageEntry[]
  index: number
  categories: Record<string, Category>
  onClose: () => void
  onNavigate: (idx: number) => void
  onStatus: (path: string, s: Status) => void
  onRating: (path: string, r: number) => void
  onNote: (path: string, n: string) => void
  onCategories: (path: string, ids: string[]) => void
  onAddCategory: (name: string) => void
  onReveal: (path: string) => void
  onOpen: (path: string) => void
  onClassify: (path: string) => void
  autoAdvance: boolean
  onExport?: (entry: ImageEntry) => void
}

export function FocusView({ entries, index, categories, onClose, onNavigate, onStatus, onRating, onNote, onCategories, onAddCategory, onReveal, onOpen, onClassify, autoAdvance, onExport }: Props) {
  const entry = entries[index]
  const [focusNote, setFocusNote] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const dragStart = useRef<{ mx: number; my: number; px: number; py: number } | null>(null)
  const imgContainerRef = useRef<HTMLDivElement>(null)

  // Reset zoom and pan on image change
  useEffect(() => { setZoom(1); setPan({ x: 0, y: 0 }) }, [index])

  const navigate = useCallback((delta: number) => {
    const next = index + delta
    if (next >= 0 && next < entries.length) onNavigate(next)
  }, [index, entries.length, onNavigate])

  const setStatusAndAdvance = useCallback((s: Status) => {
    if (!entry) return
    onStatus(entry.path, s)
    if (autoAdvance && index < entries.length - 1) setTimeout(() => navigate(1), 120)
  }, [entry, onStatus, autoAdvance, index, entries.length, navigate])

  useKeyboard({
    'ArrowLeft':  (e) => { e.preventDefault(); navigate(-1) },
    'ArrowRight': (e) => { e.preventDefault(); navigate(1) },
    ' ':          (e) => { e.preventDefault(); navigate(1) },
    'k': () => setStatusAndAdvance('keep'),
    'K': () => setStatusAndAdvance('keep'),
    'm': () => setStatusAndAdvance('maybe'),
    'M': () => setStatusAndAdvance('maybe'),
    'd': () => setStatusAndAdvance('discard'),
    'D': () => setStatusAndAdvance('discard'),
    'u': () => setStatusAndAdvance('unsorted'),
    'U': () => setStatusAndAdvance('unsorted'),
    '1': () => entry && onRating(entry.path, 1),
    '2': () => entry && onRating(entry.path, 2),
    '3': () => entry && onRating(entry.path, 3),
    '4': () => entry && onRating(entry.path, 4),
    '5': () => entry && onRating(entry.path, 5),
    '0': () => entry && onRating(entry.path, 0),
    'n': () => setFocusNote(true),
    'N': () => setFocusNote(true),
    'r': () => entry && onReveal(entry.path),
    'R': () => entry && onReveal(entry.path),
    'e': () => entry && onExport?.(entry),
    'E': () => entry && onExport?.(entry),
    'Escape': onClose,
  })

  useEffect(() => { setFocusNote(false) }, [index])

  // Wheel zoom — non-passive so we can preventDefault (stops page scroll)
  useEffect(() => {
    const el = imgContainerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
      setZoom(z => {
        const next = Math.min(8, Math.max(0.25, z * factor))
        if (next <= 1) setPan({ x: 0, y: 0 })
        return next
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // Pan handlers
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (zoom <= 1) return
    e.preventDefault()
    dragStart.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y }
    setIsDragging(true)
  }, [zoom, pan])

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragStart.current) return
    setPan({
      x: dragStart.current.px + (e.clientX - dragStart.current.mx),
      y: dragStart.current.py + (e.clientY - dragStart.current.my),
    })
  }, [])

  const onMouseUp = useCallback(() => {
    dragStart.current = null
    setIsDragging(false)
  }, [])

  if (!entry) return null

  const filename = entry.path.split('/').pop() ?? ''
  const canPrev = index > 0
  const canNext = index < entries.length - 1

  // Prefetch neighbors
  useEffect(() => {
    const prefetch = (i: number) => {
      const e = entries[i]
      if (e) window.sorter.getThumbnail(e.path).catch(() => {})
    }
    prefetch(index - 1)
    prefetch(index + 1)
  }, [index, entries])

  return (
    <div className="fixed inset-0 z-40 bg-bg flex" style={{ top: 0 }}>
      {/* Main image area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="relative z-10 flex items-center gap-3 px-5 py-3 border-b border-border flex-shrink-0">
          <button
            onClick={onClose}
            className="text-[11.7px] font-mono text-text-muted hover:text-text-secondary uppercase tracking-widest transition-colors flex items-center gap-1.5"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M6 2L2 5l4 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Grid
          </button>
          <span className="text-text-muted text-[11.7px]">·</span>
          <span className="text-[11.7px] font-mono text-text-secondary truncate flex-1">{filename}</span>
          <StatusBadge status={entry.status} />
          <span className="text-[11.7px] font-mono text-text-muted tabular-nums">{index + 1} / {entries.length}</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => navigate(-1)}
              disabled={!canPrev}
              className="p-1.5 rounded border border-border text-text-muted hover:border-[#3d3d3d] hover:text-text-secondary disabled:opacity-30 transition-all"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M6 2L2 5l4 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <button
              onClick={() => navigate(1)}
              disabled={!canNext}
              className="p-1.5 rounded border border-border text-text-muted hover:border-[#3d3d3d] hover:text-text-secondary disabled:opacity-30 transition-all"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M4 2l4 3-4 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Image wrapper — flex-1 placeholder keeps layout flow; inner div is absolute so it can't bleed into top/bottom bars */}
        <div className="flex-1 min-h-0 relative">
          <div
            ref={imgContainerRef}
            className="absolute inset-0 flex items-center justify-center p-6 overflow-hidden"
            style={{ cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
            onDoubleClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
          >
            <img
              key={entry.path}
              src={`localfile://${entry.path}`}
              alt=""
              draggable={false}
              className={`max-w-full max-h-full object-contain rounded-lg transition-opacity duration-200 select-none pointer-events-none ${entry.status === 'discard' ? 'opacity-50 grayscale' : ''}`}
              style={{
                maxHeight: '100%',
                transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
                transformOrigin: 'center center',
                transition: isDragging ? 'none' : zoom === 1 ? 'transform 0.15s ease' : 'none',
              }}
            />
            {zoom !== 1 && (
              <div className="absolute bottom-16 left-1/2 -translate-x-1/2 bg-surface/90 border border-border rounded-full px-3 py-1 text-[11.7px] font-mono text-text-secondary pointer-events-none">
                {Math.round(zoom * 100)}% · doble clic para resetear
              </div>
            )}
          </div>

          {/* Floating export button — bottom-right of image area */}
          {onExport && (
            <button
              onClick={() => onExport(entry)}
              className="titlebar-nodrag absolute bottom-5 right-5 z-20 flex items-center gap-2 px-4 py-2 rounded-lg bg-surface/90 border border-border text-[11.7px] font-mono text-text-muted hover:border-accent/50 hover:text-accent hover:bg-surface transition-all uppercase tracking-widest backdrop-blur-sm shadow-lg"
            >
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                <path d="M5.5 1v7M2 6l3.5 3.5L9 6M1 10h9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Export
            </button>
          )}
        </div>

        {/* Keyboard hint bar */}
        <div className="flex items-center justify-center gap-4 px-4 py-2 border-t border-border flex-shrink-0">
          {[
            { key: 'K', label: 'Keep', color: 'text-[#5bb98c]' },
            { key: 'M', label: 'Maybe', color: 'text-[#E8B547]' },
            { key: 'D', label: 'Discard', color: 'text-red-400' },
            { key: '←→', label: 'Navigate', color: 'text-text-muted' },
            { key: 'N', label: 'Note', color: 'text-text-muted' },
            { key: 'E', label: 'Export', color: 'text-text-muted' },
            { key: 'Esc', label: 'Grid', color: 'text-text-muted' },
          ].map(({ key, label, color }) => (
            <div key={key} className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-surface border border-border text-[11.7px] font-mono text-text-secondary">{key}</kbd>
              <span className={`text-[11.7px] font-mono ${color}`}>{label}</span>
            </div>
          ))}
          <div className="flex-1" />
          <div className="flex items-center gap-1.5">
            <span className="text-[11.7px] font-mono text-text-muted">Auto-advance</span>
            <div className={`w-6 h-3 rounded-full border transition-colors ${autoAdvance ? 'bg-accent/30 border-accent/50' : 'bg-surface border-border'}`}>
              <div className={`w-2.5 h-2.5 rounded-full mt-px transition-transform ${autoAdvance ? 'bg-accent translate-x-3' : 'bg-text-muted translate-x-px'}`} />
            </div>
          </div>
        </div>
      </div>

      {/* Inspector panel */}
      <div className="w-[260px] flex-shrink-0 border-l border-border overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b border-border flex-shrink-0">
          <span className="text-[11.7px] font-heading font-semibold uppercase tracking-widest text-text-secondary">Inspector</span>
        </div>
        <Inspector
          entry={entry}
          categories={categories}
          onStatus={onStatus}
          onRating={onRating}
          onNote={onNote}
          onCategories={onCategories}
          onAddCategory={onAddCategory}
          onReveal={onReveal}
          onOpen={onOpen}
          onClassify={onClassify}
          focusNote={focusNote}
        />
      </div>
    </div>
  )
}
