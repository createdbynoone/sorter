import React, { useState, useCallback } from 'react'
import type { ImageEntry } from '../env'

interface Props {
  entry: ImageEntry
  onClose: () => void
}

const SIZES = [
  { w: 1080, h: 1080, label: '1080×1080', key: 'box',      name: 'Box' },
  { w: 1080, h: 1920, label: '1080×1920', key: 'vertical',  name: 'Vertical' },
]

// ─── Canvas compositor ────────────────────────────────────────────────────────

function loadImg(src: string, cors = false): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image()
    if (cors) img.crossOrigin = 'anonymous'
    img.onload = () => res(img)
    img.onerror = () => rej(new Error(`Failed to load: ${src.slice(0, 80)}`))
    img.src = src
  })
}

async function composeJpeg(
  srcPath: string,
  wmDataUrl: string | null,
  w: number,
  h: number
): Promise<number[]> {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)

  const src = await loadImg(`localfile://${srcPath}`, true)
  const scale = Math.max(w / src.naturalWidth, h / src.naturalHeight)
  const sw = src.naturalWidth * scale
  const sh = src.naturalHeight * scale
  ctx.drawImage(src, (w - sw) / 2, (h - sh) / 2, sw, sh)

  if (wmDataUrl) {
    const wm = await loadImg(wmDataUrl)
    ctx.drawImage(wm, 0, 0, w, h)
  }

  return new Promise((res, rej) => {
    canvas.toBlob(blob => {
      if (!blob) { rej(new Error('toBlob failed')); return }
      blob.arrayBuffer().then(buf => res(Array.from(new Uint8Array(buf))), rej)
    }, 'image/jpeg', 0.95)
  })
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ExporterPanel({ entry, onClose }: Props) {
  const [sizes, setSizes] = useState<Set<string>>(new Set(['box', 'vertical']))
  const [exporting, setExporting] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; count?: number; error?: string } | null>(null)

  const filename = entry.path.split('/').pop() ?? ''
  const nameBase = filename.replace(/\.[^.]+$/, '')

  const toggleSize = (key: string) => setSizes(prev => {
    const n = new Set(prev)
    n.has(key) ? n.delete(key) : n.add(key)
    return n
  })

  const handleExport = useCallback(async () => {
    if (sizes.size === 0) return
    setExporting(true)
    setResult(null)
    try {
      const filesToSave: Array<{ name: string; data: number[] }> = []

      for (const size of SIZES) {
        if (!sizes.has(size.key)) continue
        const data = await composeJpeg(entry.path, null, size.w, size.h)
        filesToSave.push({ name: `${nameBase}_${size.label}.jpg`, data })
      }

      const res = await window.sorter.saveExports(filesToSave)
      setResult(res.ok
        ? { ok: true, count: filesToSave.length }
        : { ok: false, error: 'Cancelado' }
      )

      if (res.ok && res.files?.length) {
        window.sorter.revealInFinder(res.files[0])
      }
    } catch (e) {
      setResult({ ok: false, error: (e as Error).message })
    } finally {
      setExporting(false)
    }
  }, [entry.path, nameBase, sizes])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div className="w-[360px] bg-bg border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-accent">
              <path d="M6 1v8M2 6l4 4 4-4M1 11h10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="text-[11.7px] font-heading font-bold uppercase tracking-[0.18em] text-text-primary">Export</span>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text-secondary transition-colors text-lg leading-none">×</button>
        </div>

        {/* File */}
        <div className="px-4 py-2 border-b border-border bg-surface/40">
          <span className="text-[11px] font-mono text-text-muted truncate block" title={entry.path}>{filename}</span>
        </div>

        {/* Size selector */}
        <div className="px-4 pt-2 pb-3">
          <span className="text-[11px] font-mono uppercase tracking-widest text-text-muted block mb-2">Tamaños</span>
          <div className="flex gap-2">
            {SIZES.map(s => {
              const on = sizes.has(s.key)
              return (
                <button
                  key={s.key}
                  onClick={() => toggleSize(s.key)}
                  className={`flex-1 flex items-center gap-2.5 px-3 py-2.5 rounded-lg border transition-all ${
                    on ? 'border-accent/40 bg-accent/5' : 'border-border bg-surface/30'
                  }`}
                >
                  <div className={`w-3.5 h-3.5 rounded-sm border-[1.5px] flex-shrink-0 flex items-center justify-center transition-colors ${on ? 'border-accent bg-accent' : 'border-border'}`}>
                    {on && (
                      <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                        <path d="M1 3l2 2 4-4" stroke="#0c0c0c" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                  <div className="flex flex-col items-start">
                    <span className={`text-[11px] font-mono transition-colors ${on ? 'text-accent' : 'text-text-muted'}`}>{s.label}</span>
                    <span className="text-[10px] font-mono text-text-muted/50">{s.name}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Result */}
        {result && (
          <div className={`mx-4 mb-3 px-3 py-1.5 rounded-lg text-[11px] font-mono ${result.ok ? 'text-[#5bb98c] bg-[#5bb98c]/5 border border-[#5bb98c]/20' : 'text-red-400 bg-red-400/5 border border-red-400/20'}`}>
            {result.ok ? `✓ ${result.count} archivo${result.count !== 1 ? 's' : ''} exportado${result.count !== 1 ? 's' : ''}` : `✕ ${result.error}`}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 px-4 pb-4">
          <button
            onClick={onClose}
            className="flex-1 py-1.5 rounded border border-border text-[11px] font-mono text-text-muted hover:text-text-secondary transition-colors uppercase tracking-widest"
          >
            Cerrar
          </button>
          <button
            onClick={handleExport}
            disabled={exporting || sizes.size === 0}
            className="flex-1 py-1.5 rounded bg-accent/15 border border-accent/40 text-[11px] font-mono text-accent hover:bg-accent/25 transition-colors uppercase tracking-widest disabled:opacity-40 flex items-center justify-center gap-1.5"
          >
            {exporting ? (
              <>
                <svg className="animate-spin" width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M9 5A4 4 0 1 1 5 1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                </svg>
                Exportando…
              </>
            ) : (
              <>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M5 1v6M2 5l3 3 3-3M1 9h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Exportar{sizes.size > 0 ? ` (${sizes.size})` : ''}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
