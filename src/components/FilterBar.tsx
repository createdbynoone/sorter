import React from 'react'
import type { Status } from '../env'

export type SortKey = 'newest' | 'oldest' | 'status' | 'rating' | 'name'
export type FilterStatus = Status | 'all'

interface Counts { all: number; unsorted: number; keep: number; maybe: number; discard: number }

interface Props {
  filter: FilterStatus
  onFilter: (f: FilterStatus) => void
  sort: SortKey
  onSort: (s: SortKey) => void
  search: string
  onSearch: (s: string) => void
  counts: Counts
  searchRef: React.RefObject<HTMLInputElement>
  gridSize: number
  onGridSize: (s: number) => void
}

const FILTER_TABS: { key: FilterStatus; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'unsorted', label: 'Unsorted' },
  { key: 'keep', label: 'Keep' },
  { key: 'maybe', label: 'Maybe' },
  { key: 'discard', label: 'Discard' },
]

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'newest', label: 'Newest' },
  { key: 'oldest', label: 'Oldest' },
  { key: 'status', label: 'Status' },
  { key: 'rating', label: 'Rating' },
  { key: 'name', label: 'Name' },
]

const STATUS_COLORS: Record<string, string> = {
  all: 'border-white/30 bg-white/5 text-text-primary',
  unsorted: 'border-white/30 bg-white/5 text-text-primary',
  keep: 'border-[#5bb98c]/60 bg-[#5bb98c]/10 text-[#5bb98c]',
  maybe: 'border-[#E8B547]/60 bg-[#E8B547]/10 text-[#E8B547]',
  discard: 'border-red-500/50 bg-red-500/5 text-red-400',
}

const GRID_SIZES = [120, 160, 220, 300, 400]

export function FilterBar({ filter, onFilter, sort, onSort, search, onSearch, counts, searchRef, gridSize, onGridSize }: Props) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-bg border-b border-border flex-shrink-0 flex-wrap">
      {/* Status pills */}
      <div className="flex items-center gap-1">
        {FILTER_TABS.map(tab => {
          const count = counts[tab.key]
          const active = filter === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => onFilter(tab.key)}
              className={`
                flex items-center gap-1.5 px-2.5 py-[5px] rounded-md text-[11.7px] font-mono font-semibold border transition-all duration-150
                ${active ? STATUS_COLORS[tab.key] : 'border-border text-text-muted hover:border-[#3d3d3d] hover:text-text-secondary'}
              `}
            >
              {tab.label}
              <span className={`tabular-nums ${active ? 'opacity-80' : 'opacity-50'}`}>{count}</span>
            </button>
          )
        })}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Sort */}
      <div className="flex items-center gap-1">
        <span className="text-[11.7px] font-mono text-text-muted uppercase tracking-widest mr-1">Sort</span>
        {SORT_OPTIONS.map(opt => (
          <button
            key={opt.key}
            onClick={() => onSort(opt.key)}
            className={`
              px-2 py-[5px] rounded text-[11.7px] font-mono transition-all duration-150
              ${sort === opt.key ? 'text-text-primary' : 'text-text-muted hover:text-text-secondary'}
            `}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Divider */}
      <div className="w-px h-4 bg-border flex-shrink-0" />

      {/* Grid zoom */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => { const i = GRID_SIZES.indexOf(gridSize); if (i > 0) onGridSize(GRID_SIZES[i - 1]) }}
          disabled={gridSize <= GRID_SIZES[0]}
          className="text-text-muted hover:text-text-secondary disabled:opacity-25 transition-colors"
          title="Zoom out"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <rect x="1" y="1" width="4" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.1"/>
            <rect x="7" y="1" width="4" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.1"/>
            <rect x="1" y="7" width="4" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.1"/>
            <rect x="7" y="7" width="4" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.1"/>
          </svg>
        </button>
        <input
          type="range"
          min={0}
          max={GRID_SIZES.length - 1}
          step={1}
          value={GRID_SIZES.indexOf(gridSize)}
          onChange={e => onGridSize(GRID_SIZES[parseInt(e.target.value)])}
          className="w-14 h-px accent-accent cursor-pointer"
          style={{ accentColor: '#E8B547' }}
        />
        <button
          onClick={() => { const i = GRID_SIZES.indexOf(gridSize); if (i < GRID_SIZES.length - 1) onGridSize(GRID_SIZES[i + 1]) }}
          disabled={gridSize >= GRID_SIZES[GRID_SIZES.length - 1]}
          className="text-text-muted hover:text-text-secondary disabled:opacity-25 transition-colors"
          title="Zoom in"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <rect x="0.5" y="0.5" width="11" height="11" rx="1" stroke="currentColor" strokeWidth="1.1"/>
          </svg>
        </button>
      </div>

      {/* Divider */}
      <div className="w-px h-4 bg-border flex-shrink-0" />

      {/* Search */}
      <div className="flex items-center gap-1.5 bg-surface border border-border rounded-lg px-2.5 py-[5px]">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="text-text-muted flex-shrink-0">
          <circle cx="4.5" cy="4.5" r="3" stroke="currentColor" strokeWidth="1.2"/>
          <path d="M7 7l2 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
        </svg>
        <input
          ref={searchRef}
          value={search}
          onChange={e => onSearch(e.target.value)}
          placeholder="Search..."
          className="w-24 bg-transparent text-[11.7px] font-mono text-text-primary placeholder:text-text-muted focus:outline-none"
        />
        {search && (
          <button onClick={() => onSearch('')} className="text-text-muted hover:text-text-secondary text-[11.7px]">×</button>
        )}
      </div>
    </div>
  )
}
