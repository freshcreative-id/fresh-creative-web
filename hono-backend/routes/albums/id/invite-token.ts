import { Hono } from 'hono'
import { getD1 } from '../../../lib/edge-env'
import { AppEnv, requireAuthJwt } from '../../../middleware'
import { getAuthUserFromContext } from '../../../lib/auth-user'
import { getRole } from '../../../lib/auth'

function generateShortInviteCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let code = ''
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

const albumInviteTokenRoute = new Hono<AppEnv>()
albumInviteTokenRoute.use('*', requireAuthJwt)

albumInviteTokenRoute.get('/', async (c) => {
  const db = getD1(c)
  if (!db) return c.json({ error: 'Database not configured' }, 503)
  const user = getAuthUserFromContext(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  const albumId = c.req.param('id')
  if (!albumId) {
    return c.json({ error: 'Album ID required' }, 400)
  }
  const album = await db
    .prepare(
      `SELECT id, user_id, student_invite_token, student_invite_expires_at FROM albums WHERE id = ?`
    )
    .bind(albumId)
    .first<{
      id: string
      user_id: string
      student_invite_token: string | null
      student_invite_expires_at: string | null
    }>()
  if (!album) {
    return c.json({ error: 'Album not found' }, 404)
  }

  // Cek apakah user adalah global admin
  const userRole = await getRole(c, user)
  const isGlobalAdmin = userRole === 'admin'

  const isOwner = album.user_id === user.id
  if (!isOwner && !isGlobalAdmin) {
    const member = await db
      .prepare(
        `SELECT role FROM album_members WHERE album_id = ? AND user_id = ? AND role = 'admin'`
      )
      .bind(albumId, user.id)
      .first<{ role: string }>()
    if (!member) {
      return c.json({ error: 'Forbidden' }, 403)
    }
  }
  return c.json({
    token: album.student_invite_token || null,
    expiresAt: album.student_invite_expires_at || null,
  })
})

albumInviteTokenRoute.post('/', async (c) => {
  const db = getD1(c)
  if (!db) return c.json({ error: 'Database not configured' }, 503)
  const user = getAuthUserFromContext(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  const albumId = c.req.param('id')
  if (!albumId) {
    return c.json({ error: 'Album ID required' }, 400)
  }
  const album = await db
    .prepare(`SELECT id, user_id FROM albums WHERE id = ?`)
    .bind(albumId)
    .first<{ id: string; user_id: string }>()
  if (!album) {
    return c.json({ error: 'Album not found' }, 404)
  }

  // Cek apakah user adalah global admin
  const userRole = await getRole(c, user)
  const isGlobalAdmin = userRole === 'admin'

  const isOwner = album.user_id === user.id
  if (!isOwner && !isGlobalAdmin) {
    const member = await db
      .prepare(
        `SELECT role FROM album_members WHERE album_id = ? AND user_id = ? AND role = 'admin'`
      )
      .bind(albumId, user.id)
      .first<{ role: string }>()
    if (!member) {
      return c.json({ error: 'Only album owner or admin can create invite token' }, 403)
    }
  }
  const body = await c.req.json().catch(() => ({}))
  const expiresInDays = body?.expiresInDays || 7
  const token = generateShortInviteCode()
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + expiresInDays)
  const r = await db
    .prepare(
      `UPDATE albums SET student_invite_token = ?, student_invite_expires_at = ?, updated_at = datetime('now') WHERE id = ?`
    )
    .bind(token, expiresAt.toISOString(), albumId)
    .run()
  if (!r.success) {
    return c.json({ error: 'Failed to generate invite token' }, 500)
  }
  return c.json({
    token,
    expiresAt: expiresAt.toISOString(),
  })
})

export default albumInviteTokenRoute






