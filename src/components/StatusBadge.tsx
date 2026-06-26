import React from 'react'
import type { Status } from '../env'

interface Props { status: Status; size?: 'sm' | 'xs' }

const LABELS: Record<Status, string> = { keep: 'K', maybe: 'M', discard: 'D', unsorted: '·' }

const STYLES: Record<Status, string> = {
  keep:     'border-[#E8B547] text-[#E8B547] bg-[#E8B547]/10',
  maybe:    'border-[#E8B547]/40 text-[#E8B547]/60 bg-transparent',
  discard:  'border-red-500/50 text-red-400/80 bg-red-500/5',
  unsorted: 'border-border text-text-muted bg-transparent',
}

export function StatusBadge({ status, size = 'sm' }: Props) {
  if (status === 'unsorted') return null
  const px = size === 'xs' ? 'px-1 py-0.5 text-[11.7px]' : 'px-1.5 py-0.5 text-[11.7px]'
  return (
    <span className={`inline-flex items-center rounded border font-mono font-semibold tracking-wider ${px} ${STYLES[status]}`}>
      {LABELS[status]}
    </span>
  )
}

// Full word pills used in Inspector / FilterBar
export function StatusPill({ status, active, onClick }: { status: Status; active?: boolean; onClick?: () => void }) {
  const base = 'px-2.5 py-[5px] rounded-md text-[11.7px] font-heading font-semibold uppercase tracking-widest border transition-all duration-150 cursor-pointer'
  const styles: Record<Status, string> = {
    keep:     active ? 'border-[#5bb98c]/70 bg-[#5bb98c]/10 text-[#5bb98c]' : 'border-border text-text-muted hover:border-[#5bb98c]/40 hover:text-[#5bb98c]/70',
    maybe:    active ? 'border-[#E8B547]/70 bg-[#E8B547]/10 text-[#E8B547]' : 'border-border text-text-muted hover:border-[#E8B547]/40 hover:text-[#E8B547]/70',
    discard:  active ? 'border-red-500/50 bg-red-500/5 text-red-400' : 'border-border text-text-muted hover:border-red-500/30 hover:text-red-400/70',
    unsorted: active ? 'border-white/30 bg-white/5 text-text-primary' : 'border-border text-text-muted hover:border-white/20 hover:text-text-secondary',
  }
  const labels: Record<Status, string> = { keep: 'Keep', maybe: 'Maybe', discard: 'Discard', unsorted: 'Unsorted' }
  return (
    <button onClick={onClick} className={`${base} ${styles[status]}`}>{labels[status]}</button>
  )
}
