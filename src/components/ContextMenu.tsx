import React, { useEffect, useRef, useState } from 'react'
import type { ImageEntry } from '../env'

interface Props {
  entry: ImageEntry
  x: number
  y: number
  onClose: () => void
  onReveal: (path: string) => void
  onOpen: (path: string) => void
  onToggleArchive: (path: string) => void
  onToggleDiscard: (path: string) => void
}

const ITEM = 'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[11.7px] font-heading font-semibold uppercase tracking-widest transition-all duration-150'

export function ContextMenu({ entry, x, y, onClose, onReveal, onOpen, onToggleArchive, onToggleDiscard }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  // Menu renders off-screen first so we can measure its real size, then clamp
  // into the window on the next frame — avoids hardcoding an assumed width/height.
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const { offsetWidth: w, offsetHeight: h } = el
    setPos({
      left: Math.max(4, Math.min(x, window.innerWidth - w - 4)),
      top: Math.max(4, Math.min(y, window.innerHeight - h - 4)),
    })
  }, [x, y])

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const isArchived = entry.status === 'archived'
  const isDiscard = entry.status === 'discard'
  const act = (fn: () => void) => { fn(); onClose() }

  return (
    <div
      ref={ref}
      style={{ left: pos?.left ?? x, top: pos?.top ?? y, visibility: pos ? 'visible' : 'hidden' }}
      className="fixed z-50 w-[190px] flex flex-col gap-1 p-1.5 rounded-xl border border-border bg-surface/80 backdrop-blur-xl shadow-2xl animate-menu-in"
    >
      <button onClick={() => act(() => onReveal(entry.path))} className={`${ITEM} text-text-secondary hover:bg-white/5 hover:text-text-primary`}>
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none" className="flex-shrink-0">
          <path d="M1 5.5h9M6.5 2l3.5 3.5-3.5 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Reveal in Finder
      </button>
      <button onClick={() => act(() => onOpen(entry.path))} className={`${ITEM} text-text-secondary hover:bg-white/5 hover:text-text-primary`}>
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none" className="flex-shrink-0">
          <path d="M2 2h7v7M2 9l7-7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Open in Preview
      </button>

      <div className="h-px bg-border my-0.5" />

      <button onClick={() => act(() => onToggleArchive(entry.path))} className={`${ITEM} text-[#6b8fb5] hover:bg-[#6b8fb5]/10`}>
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none" className="flex-shrink-0">
          <path d="M1.5 2h8v2h-8V2Zm.75 2.5V9h6.5V4.5M4.25 6.5h2.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        {isArchived ? 'Unarchive' : 'Archive'}
      </button>
      <button onClick={() => act(() => onToggleDiscard(entry.path))} className={`${ITEM} text-red-400 hover:bg-red-500/10`}>
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none" className="flex-shrink-0">
          <path d="M1 2.5h9M3.5 2.5V1.5h4V2.5M2 2.5l.5 7h6l.5-7" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        {isDiscard ? 'Restore' : 'Discard'}
      </button>
    </div>
  )
}
