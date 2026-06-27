import { useState, useEffect, useRef } from 'react'

// Module-level shared state — one IPC call per path regardless of how many cards show it
const urlCache = new Map<string, string>()
const inflight = new Set<string>()
const waiters = new Map<string, Set<(url: string) => void>>()

function fetchThumb(path: string) {
  if (urlCache.has(path) || inflight.has(path)) return
  inflight.add(path)
  window.sorter.getThumbnail(path)
    .then(url => {
      inflight.delete(path)
      if (!url) return
      urlCache.set(path, url)
      waiters.get(path)?.forEach(fn => fn(url))
      waiters.delete(path)
    })
    .catch(() => inflight.delete(path))
}

export function useThumbnail(path: string) {
  const [src, setSrc] = useState<string | null>(urlCache.get(path) ?? null)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!path) return
    if (urlCache.has(path)) { setSrc(urlCache.get(path)!); return }

    const onReady = (url: string) => setSrc(url)
    if (!waiters.has(path)) waiters.set(path, new Set())
    waiters.get(path)!.add(onReady)
    const cleanup = () => waiters.get(path)?.delete(onReady)

    // No ref yet — load immediately without waiting for intersection
    if (!ref.current) { fetchThumb(path); return cleanup }

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return
      observer.disconnect()
      fetchThumb(path)
    }, { rootMargin: '1500px' })
    observer.observe(ref.current)

    return () => { observer.disconnect(); cleanup() }
  }, [path])

  return { src, ref }
}
