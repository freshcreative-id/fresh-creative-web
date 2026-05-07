import { Hono } from 'hono'
import { getRole } from '../../../lib/auth'
import { getD1, getAssets } from '../../../lib/edge-env'
import { putAlbumPhoto, deleteAlbumObject } from '../../../lib/r2-assets'
import { publicAlbumAssetUrl, getR2KeyFromPublicUrl } from '../../../lib/public-file-url'
import { albumPathFromR2Key } from '../../../lib/storage-layout'
import { AppEnv, requireAuthJwt } from '../../../middleware'
import { getAuthUserFromContext } from '../../../lib/auth-user'

const albumCoverRoute = new Hono<AppEnv>()
albumCoverRoute.use('*', requireAuthJwt)

// POST /api/albums/:id/cover
albumCoverRoute.post('/', async (c) => {
  const db = getD1(c)
  const bucket = getAssets(c)
  if (!db) return c.json({ error: 'Database not configured' }, 503)
  if (!bucket) return c.json({ error: 'Storage not configured' }, 503)

  const user = getAuthUserFromContext(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)

  const albumId = c.req.param('id')
  if (!albumId) return c.json({ error: 'Album ID required' }, 400)

  let fileData: ArrayBuffer | null = null
  let filename = ''
  let mimetype = 'image/jpeg'
  let positionX: string | null = null
  let positionY: string | null = null

  try {
    const formData = await c.req.formData()
    const file = formData.get('file')
    if (file != null && typeof file !== 'string') {
      fileData = await (file as Blob).arrayBuffer()
      filename = (file as File).name || 'cover.jpg'
      mimetype = (file as File).type || 'image/jpeg'
    }
    const px = formData.get('position_x')
    const py = formData.get('position_y')
    if (px) positionX = px.toString()
    if (py) positionY = py.toString()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return c.json({ error: msg || 'Invalid multipart body' }, 400)
  }

  if (!fileData || fileData.byteLength === 0) return c.json({ error: 'file required' }, 400)

  const MAX_PHOTO_BYTES = 10 * 1024 * 1024
  if (fileData.byteLength > MAX_PHOTO_BYTES) return c.json({ error: 'Foto maksimal 10MB' }, 413)

  const coverPosition =
    positionX != null && positionY != null && positionX !== '' && positionY !== ''
      ? `${positionX}% ${positionY}%`
      : null

  const album = await db
    .prepare(`SELECT id, user_id, cover_image_url FROM albums WHERE id = ?`)
    .bind(albumId)
    .first<{ id: string; user_id: string; cover_image_url: string | null }>()
  if (!album) return c.json({ error: 'Album not found' }, 404)

  const role = await getRole(c, user)
  if (album.user_id !== user.id && role !== 'admin') {
    return c.json({ error: 'Hanya pemilik album yang dapat mengubah sampul' }, 403)
  }

  const ext = filename.split('.').pop()?.toLowerCase() || 'jpg'
  const safeExt = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext) ? ext : 'jpg'
  const relPath = `${albumId}/cover.${safeExt}`

  // Cleanup old cover if exists
  if (album.cover_image_url) {
    const oldKey = getR2KeyFromPublicUrl(c, album.cover_image_url)
    if (oldKey) {
      try {
        await deleteAlbumObject(bucket, albumPathFromR2Key(oldKey))
      } catch (e) {
        console.error('Failed to cleanup old cover:', e)
      }
    }
  }

  try {
    await putAlbumPhoto(bucket, relPath, fileData, { contentType: mimetype })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Upload gagal'
    return c.json({ error: message }, 500)
  }

  const coverUrl = publicAlbumAssetUrl(c, relPath)
  // Path R2 tetap sama per album (cover.ext); tanpa penanda unik di URL publik,
  // browser/CDN memuat bytes lama dari cache setelah ganti foto dengan URL identik.
  const coverUrlVersioned = `${coverUrl}${coverUrl.includes('?') ? '&' : '?'}v=${Date.now()}`

  const r = await db
    .prepare(
      `UPDATE albums SET cover_image_url = ?, cover_image_position = ?, updated_at = datetime('now') WHERE id = ?`
    )
    .bind(coverUrlVersioned, coverPosition, albumId)
    .run()
  if (!r.success) return c.json({ error: 'Update gagal' }, 500)

  return c.json({ cover_image_url: coverUrlVersioned, cover_image_position: coverPosition ?? undefined })
})

// DELETE /api/albums/:id/cover
albumCoverRoute.delete('/', async (c) => {
  const db = getD1(c)
  if (!db) return c.json({ error: 'Database not configured' }, 503)

  const user = getAuthUserFromContext(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)

  const albumId = c.req.param('id')
  if (!albumId) return c.json({ error: 'Album ID required' }, 400)

  const album = await db
    .prepare(`SELECT id, user_id, cover_image_url FROM albums WHERE id = ?`)
    .bind(albumId)
    .first<{ id: string; user_id: string; cover_image_url: string | null }>()
  if (!album) return c.json({ error: 'Album not found' }, 404)

  const role = await getRole(c, user)
  if (album.user_id !== user.id && role !== 'admin') {
    return c.json({ error: 'Hanya pemilik album yang dapat menghapus sampul' }, 403)
  }

  const assets = getAssets(c)
  if (assets && album.cover_image_url) {
    const oldKey = getR2KeyFromPublicUrl(c, album.cover_image_url)
    if (oldKey) {
      try {
        await deleteAlbumObject(assets, albumPathFromR2Key(oldKey))
      } catch (e) {
        console.error('Failed to delete cover from R2:', e)
      }
    }
  }

  const r = await db
    .prepare(
      `UPDATE albums SET cover_image_url = NULL, cover_image_position = NULL, updated_at = datetime('now') WHERE id = ?`
    )
    .bind(albumId)
    .run()
  if (!r.success) return c.json({ error: 'Update gagal' }, 500)
  return c.json({ message: 'Sampul dihapus' })
})

export default albumCoverRoute






