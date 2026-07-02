export type Status = 'unsorted' | 'keep' | 'maybe' | 'discard'

export interface ImageEntry {
  path: string
  fingerprint: string
  status: Status
  rating: number
  categories: string[]
  note: string
  source: 'desktop' | 'folder' | 'drop'
  addedAt: number
  updatedAt: number
  missing?: boolean
}

export interface Category {
  id: string
  name: string
  color?: string
  parentId?: string
  createdAt: number
}

export interface SorterDB {
  version: 1
  entries: Record<string, ImageEntry>
  categories: Record<string, Category>
}

interface Window {
  sorter: {
    getDB:          ()                              => Promise<SorterDB>
    getPathForFile: (file: File)                    => string
    getBmpPath:     ()                              => Promise<string>
    scanDesktop:    ()                              => Promise<SorterDB>
    importFolder:   ()                              => Promise<SorterDB>
    importPaths:    (paths: string[])               => Promise<SorterDB>
    setStatus:      (path: string, status: Status)  => Promise<void>
    setRating:      (path: string, rating: number)  => Promise<void>
    setNote:        (path: string, note: string)    => Promise<void>
    setCategories:  (path: string, ids: string[])   => Promise<void>
    addCategory:    (name: string, parentId?: string, color?: string) => Promise<Record<string, Category>>
    renameCategory: (id: string, name: string)      => Promise<void>
    deleteCategory: (id: string)                    => Promise<void>
    classifyImage:  (path: string)                  => Promise<void>
    getThumbnail:   (path: string)                  => Promise<string>
    revealInFinder: (path: string)                  => Promise<void>
    openExternal:   (path: string)                  => Promise<void>
    purgeMissing:      ()                              => Promise<SorterDB>
    trashDiscarded:    ()                              => Promise<SorterDB>
    getWatermarksPath: () => Promise<string>
    readWatermark: (name: string) => Promise<string | null>
    saveExports: (files: Array<{ name: string; data: number[] }>) => Promise<{ ok: boolean; files?: string[]; error?: string }>

    getVersion:     ()                              => Promise<string>
    onFileAdded:    (cb: (entry: ImageEntry) => void) => () => void
    onFileRemoved:  (cb: (path: string) => void)      => () => void
    onClassified:   (cb: (entry: ImageEntry) => void) => () => void
    onUpdateStatus: (cb: (s: { phase: string; version?: string; percent?: number; error?: string }) => void) => () => void
  }
}
