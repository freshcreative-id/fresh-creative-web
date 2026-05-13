import type { Context } from 'hono'

/**
 * Base URL untuk redirect Xendit (success/failure).
 * Prioritas: env Worker → Origin → Referer.
 * Browser cross-origin ke Workers mengirim Origin (mis. https://app.vercel.app).
 */
export function getPublicAppUrl(c: Context): string {
  const env = (c.env as { NEXT_PUBLIC_APP_URL?: string })?.NEXT_PUBLIC_APP_URL?.trim()
  if (env) return env.replace(/\/$/, '')

  const origin = c.req.header('Origin')?.trim()
  if (origin && /^https?:\/\//i.test(origin)) {
    try {
      const u = new URL(origin)
      if (u.protocol === 'http:' || u.protocol === 'https:') {
        return u.origin.replace(/\/$/, '')
      }
    } catch {
      /* ignore */
    }
  }

  const referer = c.req.header('Referer')?.trim()
  if (referer) {
    try {
      return new URL(referer).origin.replace(/\/$/, '')
    } catch {
      /* ignore */
    }
  }

  return ''
}
