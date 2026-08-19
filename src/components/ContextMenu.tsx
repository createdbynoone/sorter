import React, { useEffect, useRef, useState } from 'react'
import type { ImageEntry } from '../env'

interface Props {
  entries: ImageEntry[]
  x: number
  y: number
  onClose: () => void
  onReveal: (path: string) => void
  onOpen: (path: string) => void
  onArchiveMany: (paths: string[]) => void
  onDiscardMany: (paths: string[]) => void
}

const ITEM = 'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[11.7px] font-heading font-semibold uppercase tracking-widest transition-all duration-150'

export function ContextMenu({ entries, x, y, onClose, onReveal, onOpen, onArchiveMany, onDiscardMany }: Props) {
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

  const count = entries.length
  const single = count === 1
  const paths = entries.map(e => e.path)
  const allArchived = entries.every(e => e.status === 'archived')
  const allDiscard = entries.every(e => e.status === 'discard')
  const act = (fn: () => void) => { fn(); onClose() }

  return (
    <div
      ref={ref}
      style={{ left: pos?.left ?? x, top: pos?.top ?? y, visibility: pos ? 'visible' : 'hidden' }}
      className="fixed z-50 w-[190px] flex flex-col gap-1 p-1.5 rounded-xl border border-border bg-surface/80 backdrop-blur-xl shadow-2xl animate-menu-in"
    >
      {!single && (
        <div className="px-3 pb-1 pt-0.5 text-[10.7px] font-heading font-semibold uppercase tracking-widest text-text-muted">
          {count} selected
        </div>
      )}

      {single && (
        <>
          <button onClick={() => act(() => onReveal(entries[0].path))} className={`${ITEM} text-text-secondary hover:bg-white/5 hover:text-text-primary`}>
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" className="flex-shrink-0">
              <path d="M1 5.5h9M6.5 2l3.5 3.5-3.5 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Reveal in Finder
          </button>
          <button onClick={() => act(() => onOpen(entries[0].path))} className={`${ITEM} text-text-secondary hover:bg-white/5 hover:text-text-primary`}>
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" className="flex-shrink-0">
              <path d="M2 2h7v7M2 9l7-7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Open in Preview
          </button>

          <div className="h-px bg-border my-0.5" />
        </>
      )}

      <button onClick={() => act(() => onArchiveMany(paths))} className={`${ITEM} text-[#6b8fb5] hover:bg-[#6b8fb5]/10`}>
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none" className="flex-shrink-0">
          <path d="M1.5 2h8v2h-8V2Zm.75 2.5V9h6.5V4.5M4.25 6.5h2.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        {allArchived ? 'Unarchive' : single ? 'Archive' : `Archive (${count})`}
      </button>
      <button onClick={() => act(() => onDiscardMany(paths))} className={`${ITEM} text-red-400 hover:bg-red-500/10`}>
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none" className="flex-shrink-0">
          <path d="M1 2.5h9M3.5 2.5V1.5h4V2.5M2 2.5l.5 7h6l.5-7" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        {allDiscard ? 'Restore' : single ? 'Discard' : `Discard (${count})`}
      </button>
    </div>
  )
}
