import { Hono } from 'hono'
import { getAssets } from '../lib/edge-env'

const ALLOWED_PREFIXES = [
  'album-photos/',
  'landing/portfolio/',
] as const

const files = new Hono()

files.get('*', async (c) => {
  const bucket = getAssets(c)
  if (!bucket) return c.json({ error: 'Storage not configured' }, 503)

  const pathname = new URL(c.req.url).pathname
  const prefix = '/api/files/'
  if (!pathname.startsWith(prefix)) return c.notFound()

  let rest = pathname.slice(prefix.length)
  try {
    rest = decodeURIComponent(rest)
  } catch {
    /* gunakan raw */
  }
  if (!ALLOWED_PREFIXES.some((p) => rest.startsWith(p))) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const rangeHeader = c.req.header('range') || c.req.header('Range')
  const size = await bucket.head(rest).then((h) => h?.size ?? null).catch(() => null)

  let obj = null as Awaited<ReturnType<typeof bucket.get>> | null
  let status = 200

  // Basic HTTP Range support for media playback
  if (rangeHeader && typeof size === 'number' && Number.isFinite(size)) {
    const m = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim())
    if (m) {
      const startRaw = m[1]
      const endRaw = m[2]
      let start = startRaw ? parseInt(startRaw, 10) : 0
      let end = endRaw ? parseInt(endRaw, 10) : (size - 1)
      if (Number.isNaN(start)) start = 0
      if (Number.isNaN(end)) end = size - 1
      // clamp
      start = Math.max(0, Math.min(start, size - 1))
      end = Math.max(start, Math.min(end, size - 1))
      obj = await bucket.get(rest, { range: { offset: start, length: end - start + 1 } })
      status = 206
    }
  }

  if (!obj) {
    obj = await bucket.get(rest)
    status = 200
  }
  if (!obj) return c.notFound()

  const headers = new Headers()
  const metadata = obj.httpMetadata
  if (metadata?.contentType) headers.set('Content-Type', metadata.contentType)
  if (metadata?.contentLanguage) headers.set('Content-Language', metadata.contentLanguage)
  if (metadata?.contentDisposition) headers.set('Content-Disposition', metadata.contentDisposition)
  if (metadata?.contentEncoding) headers.set('Content-Encoding', metadata.contentEncoding)
  if (metadata?.cacheControl) headers.set('Cache-Control', metadata.cacheControl)
  if (metadata?.cacheExpiry) headers.set('Expires', metadata.cacheExpiry.toUTCString())
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/octet-stream')
  }
  if (!headers.has('Cache-Control')) {
    // Asset key menggunakan UUID/versioned path, aman cache panjang untuk performa.
    headers.set('Cache-Control', 'public, max-age=31536000, immutable')
  }

  if (typeof size === 'number' && Number.isFinite(size)) {
    headers.set('Accept-Ranges', 'bytes')
    if (status === 206) {
      const rangeHeader = c.req.header('range') || c.req.header('Range') || ''
      const m = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim())
      if (m) {
        const start = m[1] ? parseInt(m[1], 10) : 0
        const end = m[2] ? parseInt(m[2], 10) : (size - 1)
        const safeStart = Number.isFinite(start) ? Math.max(0, Math.min(start, size - 1)) : 0
        const safeEnd = Number.isFinite(end) ? Math.max(safeStart, Math.min(end, size - 1)) : (size - 1)
        headers.set('Content-Range', `bytes ${safeStart}-${safeEnd}/${size}`)
        headers.set('Content-Length', String(safeEnd - safeStart + 1))
      }
    } else {
      headers.set('Content-Length', String(size))
    }
  }

  return new Response(obj.body as unknown as BodyInit, { headers, status })
})

export default files






