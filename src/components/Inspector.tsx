import React, { useState, useEffect, useRef, useCallback } from 'react'
import { StatusPill } from './StatusBadge'
import { RatingDots } from './RatingDots'
import type { ImageEntry, Category, Status } from '../env'

interface Props {
  entry: ImageEntry | null
  categories: Record<string, Category>
  onStatus: (path: string, s: Status) => void
  onRating: (path: string, r: number) => void
  onNote: (path: string, n: string) => void
  onCategories: (path: string, ids: string[]) => void
  onAddCategory: (name: string, parentId?: string) => void
  onReveal: (path: string) => void
  onOpen: (path: string) => void
  onClassify?: (path: string) => void
  focusNote?: boolean
}

const STATUSES: Status[] = ['keep', 'maybe', 'discard', 'unsorted']

export function Inspector({ entry, categories, onStatus, onRating, onNote, onCategories, onAddCategory, onReveal, onOpen, onClassify, focusNote }: Props) {
  const [noteValue, setNoteValue] = useState('')
  const [newCatName, setNewCatName] = useState('')
  const [addingCat, setAddingCat] = useState(false)
  const [addingCatParentId, setAddingCatParentId] = useState<string | undefined>(undefined)
  const noteRef = useRef<HTMLTextAreaElement>(null)
  const newCatRef = useRef<HTMLInputElement>(null)

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

  const toggleCat = useCallback((id: string) => {
    if (!entry) return
    const ids = entry.categories.includes(id)
      ? entry.categories.filter(c => c !== id)
      : [...entry.categories, id]
    onCategories(entry.path, ids)
  }, [entry, onCategories])

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
    <div className="flex flex-col gap-4 p-4 overflow-y-auto h-full">
      {/* File info */}
      <div className="flex flex-col gap-1">
        <p className="text-[11.7px] font-mono text-text-primary break-all leading-relaxed selectable">{filename}</p>
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

      {/* Rating */}
      <div className="flex flex-col gap-2">
        <span className="text-[11.7px] font-heading font-semibold uppercase tracking-widest text-text-secondary">Rating</span>
        <RatingDots rating={entry.rating} onChange={(r) => onRating(entry.path, r)} size="md" />
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
              <span className="text-[11.7px] font-heading font-semibold uppercase tracking-widest text-text-secondary">Category</span>
              <div className="flex flex-wrap gap-1.5">
                {parentCats.map(cat => {
                  const active = entry.categories.includes(cat.id)
                  return (
                    <button key={cat.id} onClick={() => toggleCat(cat.id)}
                      className={`px-2 py-1 rounded-md text-[11.7px] font-mono border transition-all duration-150
                        ${active ? 'border-accent/50 bg-accent/10 text-accent' : 'border-border text-text-muted hover:border-[#3d3d3d] hover:text-text-secondary'}`}>
                      {cat.name}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Subcategories — shown under active parent */}
            {activeParentId && (() => {
              const subs = childCats.filter(c => c.parentId === activeParentId).sort((a, b) => a.createdAt - b.createdAt)
              if (subs.length === 0 && !addingCat) return null
              return (
                <div className="flex flex-col gap-1.5 pl-2 border-l border-border/50">
                  <span className="text-[11.7px] font-mono uppercase tracking-widest text-accent/60">Product</span>
                  <div className="flex flex-wrap gap-1.5">
                    {subs.map(cat => {
                      const active = activeSubs.includes(cat.id)
                      return (
                        <button key={cat.id} onClick={() => toggleCat(cat.id)}
                          className={`px-2 py-0.5 rounded text-[11.7px] font-mono border transition-all duration-150
                            ${active ? 'border-accent/40 bg-accent/8 text-accent/80' : 'border-border/60 text-text-muted hover:border-[#3d3d3d] hover:text-text-secondary'}`}>
                          {cat.name}
                        </button>
                      )
                    })}
                    {addingCat && addingCatParentId === activeParentId ? (
                      <input ref={newCatRef} value={newCatName}
                        onChange={e => setNewCatName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleAddCat(); if (e.key === 'Escape') { setAddingCat(false); setNewCatName(''); setAddingCatParentId(undefined) } }}
                        onBlur={handleAddCat} placeholder="New product..."
                        className="px-2 py-0.5 rounded text-[11.7px] font-mono border border-accent/40 bg-accent/5 text-text-primary placeholder:text-text-muted focus:outline-none w-28" />
                    ) : (
                      <button onClick={() => { setAddingCat(true); setAddingCatParentId(activeParentId) }}
                        className="px-2 py-0.5 rounded text-[11.7px] font-mono border border-dashed border-border/60 text-text-muted hover:border-[#3d3d3d] hover:text-text-secondary transition-all duration-150">
                        + Product
                      </button>
                    )}
                  </div>
                </div>
              )
            })()}

            {/* Top-level new category (no parent selected) */}
            {!activeParentId && (
              <div className="flex flex-wrap gap-1.5">
                {addingCat && !addingCatParentId ? (
                  <input ref={newCatRef} value={newCatName}
                    onChange={e => setNewCatName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleAddCat(); if (e.key === 'Escape') { setAddingCat(false); setNewCatName('') } }}
                    onBlur={handleAddCat} placeholder="New category..."
                    className="px-2 py-1 rounded-md text-[11.7px] font-mono border border-accent/40 bg-accent/5 text-text-primary placeholder:text-text-muted focus:outline-none w-28" />
                ) : (
                  <button onClick={() => { setAddingCat(true); setAddingCatParentId(undefined) }}
                    className="px-2 py-1 rounded-md text-[11.7px] font-mono border border-dashed border-border text-text-muted hover:border-[#3d3d3d] hover:text-text-secondary transition-all duration-150">
                    + New
                  </button>
                )}
              </div>
            )}
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
        {onClassify && (
          <button
            onClick={() => onClassify(entry.path)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-accent/25 text-[11.7px] font-heading font-semibold uppercase tracking-widest text-accent/60 hover:border-accent/50 hover:text-accent transition-all duration-150"
          >
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.1"/>
              <path d="M3.5 5.5l1.5 1.5 2.5-2.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Auto-classify
          </button>
        )}
      </div>
    </div>
  )
}
