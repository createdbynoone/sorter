import React, { useState, useCallback, useEffect } from 'react'

interface Props {
  onPaths: (paths: string[]) => void
}

export function DropOverlay({ onPaths }: Props) {
  const [dragging, setDragging] = useState(false)
  const [counter, setCounter] = useState(0)

  const onDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault()
    setCounter(c => c + 1)
    setDragging(true)
  }, [])

  const onDragLeave = useCallback(() => {
    setCounter(c => {
      const next = c - 1
      if (next <= 0) setDragging(false)
      return next
    })
  }, [])

  const onDragOver = useCallback((e: DragEvent) => { e.preventDefault() }, [])

  const onDrop = useCallback((e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    setCounter(0)
    const paths = Array.from(e.dataTransfer?.files ?? []).map((f: File) => (f as unknown as { path: string }).path).filter(Boolean)
    if (paths.length) onPaths(paths)
  }, [onPaths])

  useEffect(() => {
    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [onDragEnter, onDragLeave, onDragOver, onDrop])

  if (!dragging) return null

  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      <div className="absolute inset-3 rounded-xl border-2 border-dashed border-accent/60 bg-accent/5 flex flex-col items-center justify-center gap-3">
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" className="text-accent">
          <path d="M16 4v16M8 12l8-8 8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M4 24h24" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
        <span className="text-sm font-heading font-semibold uppercase tracking-widest text-accent">Drop to import</span>
        <span className="text-[11.7px] font-mono text-accent/50">Images or folders</span>
      </div>
    </div>
  )
}
