import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('sorter', {
  getDB:          ()                              => ipcRenderer.invoke('sorter:get-db'),
  getBmpPath:     ()                              => ipcRenderer.invoke('sorter:get-bmp-path'),
  scanDesktop:    ()                              => ipcRenderer.invoke('sorter:scan-desktop'),
  importFolder:   ()                              => ipcRenderer.invoke('sorter:import-folder'),
  importPaths:    (paths: string[])               => ipcRenderer.invoke('sorter:import-paths', paths),

  setStatus:      (path: string, status: string)  => ipcRenderer.invoke('sorter:set-status', { path, status }),
  setRating:      (path: string, rating: number)  => ipcRenderer.invoke('sorter:set-rating', { path, rating }),
  setNote:        (path: string, note: string)    => ipcRenderer.invoke('sorter:set-note', { path, note }),
  setCategories:  (path: string, ids: string[])   => ipcRenderer.invoke('sorter:set-categories', { path, ids }),

  addCategory:    (name: string, parentId?: string, color?: string) => ipcRenderer.invoke('sorter:add-category', { name, parentId, color }),
  renameCategory: (id: string, name: string)      => ipcRenderer.invoke('sorter:rename-category', { id, name }),
  deleteCategory: (id: string)                    => ipcRenderer.invoke('sorter:delete-category', id),
  classifyImage:  (path: string)                  => ipcRenderer.invoke('sorter:classify-image', path),

  getThumbnail:   (path: string)                  => ipcRenderer.invoke('sorter:get-thumb', path),
  revealInFinder: (path: string)                  => ipcRenderer.invoke('sorter:reveal', path),
  openExternal:   (path: string)                  => ipcRenderer.invoke('sorter:open', path),
  purgeMissing:      ()                              => ipcRenderer.invoke('sorter:purge-missing'),
  trashDiscarded:    ()                              => ipcRenderer.invoke('sorter:trash-discarded'),

  getVersion: () => ipcRenderer.invoke('get-version'),

  onFileAdded:   (cb: (entry: unknown) => void) => {
    ipcRenderer.on('sorter:file-added', (_e, entry) => cb(entry))
    return () => ipcRenderer.removeAllListeners('sorter:file-added')
  },
  onFileRemoved: (cb: (path: string) => void) => {
    ipcRenderer.on('sorter:file-removed', (_e, path) => cb(path))
    return () => ipcRenderer.removeAllListeners('sorter:file-removed')
  },
  onClassified: (cb: (entry: unknown) => void) => {
    ipcRenderer.on('sorter:classified', (_e, entry) => cb(entry))
    return () => ipcRenderer.removeAllListeners('sorter:classified')
  },
  onUpdateStatus: (cb: (s: unknown) => void) => {
    ipcRenderer.on('update-status', (_e, s) => cb(s))
    return () => ipcRenderer.removeAllListeners('update-status')
  },
})
