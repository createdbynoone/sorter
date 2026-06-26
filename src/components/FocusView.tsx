import React, { useState, useEffect, useCallback } from 'react'
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
}

export function FocusView({ entries, index, categories, onClose, onNavigate, onStatus, onRating, onNote, onCategories, onAddCategory, onReveal, onOpen, onClassify, autoAdvance }: Props) {
  const entry = entries[index]
  const [focusNote, setFocusNote] = useState(false)

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
    'Escape': onClose,
  })

  useEffect(() => { setFocusNote(false) }, [index])

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
        <div className="flex items-center gap-3 px-5 py-3 border-b border-border flex-shrink-0">
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

        {/* Image */}
        <div className="flex-1 flex items-center justify-center p-6 min-h-0 relative">
          <img
            key={entry.path}
            src={`localfile://${entry.path}`}
            alt=""
            className={`max-w-full max-h-full object-contain rounded-lg transition-opacity duration-200 ${entry.status === 'discard' ? 'opacity-50 grayscale' : ''}`}
            style={{ maxHeight: '100%' }}
          />
        </div>

        {/* Keyboard hint bar */}
        <div className="flex items-center justify-center gap-4 px-4 py-2 border-t border-border flex-shrink-0">
          {[
            { key: 'K', label: 'Keep', color: 'text-[#5bb98c]' },
            { key: 'M', label: 'Maybe', color: 'text-[#E8B547]' },
            { key: 'D', label: 'Discard', color: 'text-red-400' },
            { key: '←→', label: 'Navigate', color: 'text-text-muted' },
            { key: 'N', label: 'Note', color: 'text-text-muted' },
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
