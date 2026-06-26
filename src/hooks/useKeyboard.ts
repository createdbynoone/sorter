import { useEffect, useCallback } from 'react'

type KeyMap = Record<string, (e: KeyboardEvent) => void>

// Register global keyboard shortcuts, ignoring events when an input/textarea is focused
export function useKeyboard(map: KeyMap, enabled = true) {
  const handler = useCallback((e: KeyboardEvent) => {
    if (!enabled) return
    const target = e.target as HTMLElement
    const inInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
    const key = [
      e.metaKey ? 'cmd+' : '',
      e.ctrlKey ? 'ctrl+' : '',
      e.shiftKey ? 'shift+' : '',
      e.key,
    ].join('')
    const cb = map[key] ?? map[e.key]
    if (!cb) return
    // Allow Escape even in inputs
    if (inInput && e.key !== 'Escape') return
    cb(e)
  }, [map, enabled])

  useEffect(() => {
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handler])
}
