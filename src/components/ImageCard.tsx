import React, { useRef, useEffect } from 'react'
import { useThumbnail } from '../hooks/useThumbnail'
import { StatusBadge } from './StatusBadge'
import { RatingDots } from './RatingDots'
import type { ImageEntry, Category } from '../env'

interface Props {
  entry: ImageEntry
  categories: Record<string, Category>
  selected: boolean
  isNew?: boolean
  onClick: () => void
  onDoubleClick: () => void
}

export function ImageCard({ entry, categories, selected, isNew, onClick, onDoubleClick }: Props) {
  const { src, ref: thumbRef } = useThumbnail(entry.path)
  const cardRef = useRef<HTMLDivElement>(null)

  const isDiscard = entry.status === 'discard'
  const catChips = entry.categories.slice(0, 2).map(id => categories[id]).filter(Boolean)
  const extraCats = entry.categories.length - 2

  // Scroll into view when selected
  useEffect(() => {
    if (selected) cardRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selected])

  return (
    <div
      ref={cardRef}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      className={`
        relative rounded-lg border overflow-hidden cursor-pointer group
        transition-all duration-150
        ${isNew ? 'pulse-new' : ''}
        ${selected
          ? 'border-accent ring-1 ring-accent/50'
          : 'border-border hover:border-[#3d3d3d]'
        }
        ${isDiscard ? 'opacity-40 grayscale' : ''}
      `}
      style={{ aspectRatio: '4/5' }}
    >
      {/* Thumbnail */}
      <div ref={thumbRef as React.RefObject<HTMLDivElement>} className="absolute inset-0 bg-[#141414]">
        {src && (
          <img
            src={src}
            alt=""
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover"
          />
        )}
        {!src && (
          <div className="w-full h-full flex items-center justify-center">
            <div className="w-4 h-4 rounded-full border border-border animate-pulse" />
          </div>
        )}
      </div>

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

      {/* Bottom overlay — rating + cats (hover) */}
      <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/80 to-transparent px-2 pb-2 pt-4 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
        <div className="flex items-end justify-between gap-1">
          {entry.rating > 0 && <RatingDots rating={entry.rating} />}
          <div className="flex items-center gap-1 flex-wrap justify-end">
            {catChips.map(cat => (
              <span key={cat.id} className="text-[11.7px] font-mono text-text-muted border border-border rounded px-1 py-0.5 bg-black/60 truncate max-w-[60px]">
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
