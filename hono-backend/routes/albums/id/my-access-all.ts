import { Hono } from 'hono'
import { getD1 } from '../../../lib/edge-env'
import { AppEnv, requireAuthJwt } from '../../../middleware'
import { getAuthUserFromContext } from '../../../lib/auth-user'
import { getRole } from '../../../lib/auth'

const albumsIdMyAccessAll = new Hono<AppEnv>()
albumsIdMyAccessAll.use('*', requireAuthJwt)

albumsIdMyAccessAll.get('/', async (c) => {
  try {
    const db = getD1(c)
    if (!db) return c.json({ error: 'Database not configured' }, 503)
    const user = getAuthUserFromContext(c)

    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    const albumId = c.req.param('id')
    if (!albumId) {
      return c.json({ error: 'Album ID required' }, 400)
    }

    // Cek apakah user adalah global admin — jika ya, langsung loloskan
    const role = await getRole(c, user)
    const isGlobalAdmin = role === 'admin'

    const album = await db
      .prepare(`SELECT id, user_id FROM albums WHERE id = ?`)
      .bind(albumId)
      .first<{ id: string; user_id: string }>()
    if (!album) return c.json({ error: 'Album not found' }, 404)

    const isOwner = album.user_id === user.id
    const memberRow = await db
      .prepare(`SELECT role FROM album_members WHERE album_id = ? AND user_id = ? LIMIT 1`)
      .bind(albumId, user.id)
      .first<{ role: string }>()
    const isAlbumAdmin = memberRow?.role === 'admin'
    const isAlbumMember = !!memberRow

    const { results: accessRows } = await db
      .prepare(
        `SELECT id, class_id, album_id, user_id, student_name, email, status, date_of_birth, instagram, message, video_url, photos, created_at
         FROM album_class_access WHERE album_id = ? AND user_id = ?`
      )
      .bind(albumId, user.id)
      .all<Record<string, unknown>>()

    const { results: requestRows } = await db
      .prepare(
        `SELECT id, album_id, user_id, student_name, email, phone, class_name, status, assigned_class_id, requested_at
         FROM album_join_requests WHERE album_id = ? AND user_id = ?`
      )
      .bind(albumId, user.id)
      .all<Record<string, unknown>>()

    const hasAnyAccess = Array.isArray(accessRows) && accessRows.length > 0
    const hasAnyRequest = Array.isArray(requestRows) && requestRows.length > 0

    // Global admin selalu diizinkan melihat album
    const canStillSeeAlbum = isGlobalAdmin || isOwner || isAlbumAdmin || isAlbumMember || hasAnyAccess || hasAnyRequest
    if (!canStillSeeAlbum) {
      return c.json({ error: 'Tidak punya akses ke album ini' }, 403)
    }

    const accessByClass: Record<string, unknown> = {}
    accessRows?.forEach((item) => {
      const cid = item.class_id as string
      if (cid) accessByClass[cid] = item
    })

    const requestsByClassMap: Record<string, unknown> = {}
    requestRows?.forEach((item) => {
      const cid = item.assigned_class_id as string
      if (cid) requestsByClassMap[cid] = item
    })

    return c.json({ access: accessByClass, requests: requestsByClassMap, isGlobalAdmin })
  } catch (err: unknown) {
    console.error('Error in my-access-all:', err)
    return c.json({ error: err instanceof Error ? err.message : 'Internal Server Error' }, 500)
  }
})

export default albumsIdMyAccessAll
