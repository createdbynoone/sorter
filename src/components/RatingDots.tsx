import React from 'react'

interface Props {
  rating: number
  onChange?: (r: number) => void
  size?: 'sm' | 'md'
}

export function RatingDots({ rating, onChange, size = 'sm' }: Props) {
  const sz = size === 'sm' ? 'w-2 h-2' : 'w-2.5 h-2.5'
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map(i => (
        <button
          key={i}
          onClick={onChange ? (e) => { e.stopPropagation(); onChange(rating === i ? 0 : i) } : undefined}
          className={`${sz} rounded-full border transition-all duration-100 flex-shrink-0 ${
            i <= rating
              ? 'bg-accent border-accent'
              : 'bg-transparent border-border hover:border-accent/50'
          } ${onChange ? 'cursor-pointer' : 'cursor-default'}`}
        />
      ))}
    </div>
  )
}
