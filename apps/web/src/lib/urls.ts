/**
 * In production the SPA and the sink share one origin, so location.origin is
 * the right base. In Vite dev they don't (Vite only proxies /api, and any
 * other path is the SPA itself), so sink URLs point straight at the server.
 */
const sinkBase = import.meta.env.DEV ? 'http://localhost:3000' : window.location.origin;

export function sinkUrl(address: string): string {
  return `${sinkBase}/${address}`;
}

export function dashboardPath(address: string): string {
  return `/b/${address}`;
}
