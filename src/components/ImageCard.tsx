import React, { useRef, useEffect } from 'react'
import { useThumbnail } from '../hooks/useThumbnail'
import { StatusBadge } from './StatusBadge'
import { isVideoPath } from '../utils/media'
import type { ImageEntry, Category } from '../env'

interface Props {
  entry: ImageEntry
  categories: Record<string, Category>
  selected: boolean
  primary?: boolean
  isNew?: boolean
  onClick: (e: React.MouseEvent) => void
  onDoubleClick: () => void
  onContextMenu: (e: React.MouseEvent) => void
}

export function ImageCard({ entry, categories, selected, primary, isNew, onClick, onDoubleClick, onContextMenu }: Props) {
  const { src, ref: thumbRef } = useThumbnail(entry.path)
  const cardRef = useRef<HTMLDivElement>(null)

  const isDiscard = entry.status === 'discard'
  const isArchived = entry.status === 'archived'
  const isVideo = isVideoPath(entry.path)
  const catChips = entry.categories.slice(0, 2).map(id => categories[id]).filter(Boolean)
  const extraCats = entry.categories.length - 2

  // Native OS drag-out — hands the real file (no copy) to another app's drop
  // target, e.g. dragging a render straight into BMP.
  const handleDragStart = (e: React.DragEvent) => {
    e.preventDefault()
    window.sorter.dragStart(entry.path)
  }

  // Scroll into view only for the primary/anchor card — keying this off `selected`
  // instead would fire scrollIntoView for every card in a multi-selection at once
  // (indeterminate which one wins) on every shift-click range select.
  useEffect(() => {
    if (primary) cardRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [primary])

  return (
    <div
      ref={cardRef}
      data-image-card="true"
      data-path={entry.path}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      draggable
      onDragStart={handleDragStart}
      className={`
        relative rounded-lg border overflow-hidden cursor-pointer group
        transition-all duration-150
        ${isNew ? 'pulse-new' : ''}
        ${selected
          ? 'border-accent ring-1 ring-accent/50'
          : 'border-border hover:border-[#3d3d3d]'
        }
        ${isDiscard ? 'opacity-40 grayscale' : ''}
        ${isArchived ? 'opacity-60' : ''}
      `}
      style={{ aspectRatio: '4/5' }}
    >
      {/* Thumbnail */}
      <div ref={thumbRef as React.RefObject<HTMLDivElement>} className="absolute inset-0 bg-[#141414]">
        {!src && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-3 h-3 rounded-full border border-border/50 animate-pulse" />
          </div>
        )}
        {src && (
          <img
            src={src}
            alt=""
            decoding="async"
            className="w-full h-full object-cover transition-opacity duration-200"
            style={{ opacity: 0 }}
            onLoad={e => { (e.currentTarget as HTMLImageElement).style.opacity = '1' }}
          />
        )}
      </div>

      {/* Video indicator — centered so it never collides with the hover gradient or category chips */}
      {isVideo && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <div className="w-9 h-9 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center">
            <svg width="12" height="12" viewBox="0 0 8 8" fill="currentColor" className="text-white translate-x-px">
              <path d="M1 1l6 3-6 3V1z" />
            </svg>
          </div>
        </div>
      )}

      {/* Status badge — top right */}
      {entry.status !== 'unsorted' && (
        <div className="absolute top-1.5 right-1.5 z-10">
          <StatusBadge status={entry.status} size="xs" />
        </div>
      )}

      {/* Missing indicator */}
      {entry.missing && (
        <div className="absolute top-1.5 left-1.5 z-10 px-1 py-0.5 rounded bg-black/70 text-[11.7px] font-mono text-text-muted">
          missing
        </div>
      )}

      {/* Bottom overlay — cats (hover) */}
      <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/80 to-transparent px-2 pb-2 pt-4 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
        <div className="flex items-end justify-end gap-1">
          <div className="flex items-center gap-1 flex-wrap justify-end">
            {catChips.map(cat => (
              <span key={cat.id} className="text-[11.7px] font-mono uppercase text-text-muted border border-border rounded px-1 py-0.5 bg-black/60 truncate max-w-[60px]">
                {cat.name}
              </span>
            ))}
            {extraCats > 0 && (
              <span className="text-[11.7px] font-mono text-text-muted">+{extraCats}</span>
            )}
          </div>
        </div>
        {/* Note dot */}
        {entry.note && (
          <div className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-accent/70" />
        )}
      </div>
    </div>
  )
}
