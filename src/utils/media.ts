export function isVideoPath(path: string): boolean {
  return /\.(mp4|mov|webm|m4v)$/i.test(path)
}

// localfile is a `standard: true` scheme (required for <video> playback) — standard-scheme
// URL parsing collapses leading slashes into an authority component, so a bare absolute
// path would have its first segment mistaken for a host. The dummy `-` host keeps the
// real path intact in the request's url.pathname on the main-process side.
export function toLocalFileUrl(path: string): string {
  return `localfile://-${encodeURI(path)}`
}
