import { useState, useEffect, useRef } from 'react'

const cache = new Map<string, string>()

export function useThumbnail(path: string, enabled = true) {
  const [src, setSrc] = useState<string | null>(cache.get(path) ?? null)
  const ref = useRef<HTMLDivElement | null>(null)
  const observerRef = useRef<IntersectionObserver | null>(null)

  useEffect(() => {
    if (!enabled || !path) return
    if (cache.has(path)) { setSrc(cache.get(path)!); return }

    const el = ref.current
    if (!el) return

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return
        observerRef.current?.disconnect()
        window.sorter.getThumbnail(path).then(url => {
          if (url) { cache.set(path, url); setSrc(url) }
        })
      },
      { rootMargin: '600px' }
    )
    observerRef.current.observe(el)
    return () => observerRef.current?.disconnect()
  }, [path, enabled])

  return { src, ref }
}
