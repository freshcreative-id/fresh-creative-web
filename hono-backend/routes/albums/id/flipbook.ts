import { Hono } from 'hono'
import type { Context } from 'hono'
import { getRole } from '../../../lib/auth'
import { getD1 } from '../../../lib/edge-env'
import { getAssets } from '../../../lib/edge-env'
import { putAlbumPhoto } from '../../../lib/r2-assets'
import { publicAlbumAssetUrl } from '../../../lib/public-file-url'
import {
  flipbookPublicCache,
  FLIPBOOK_PUBLIC_TTL_MS,
  invalidateAlbumCaches,
} from '../../../lib/album-response-cache'
import {
  deleteR2ObjectFromPublicUrl,
  deleteR2ObjectsFromPublicUrls,
} from '../../../lib/r2-public-url-cleanup'
import { AppEnv, requireAuthJwt } from '../../../middleware'
import { getAuthUserFromContext } from '../../../lib/auth-user'

const albumFlipbookRoute = new Hono<AppEnv>()
albumFlipbookRoute.use('*', async (c, next) => {

  // Keep public flipbook endpoint accessible without auth.
  if (c.req.path.endsWith('/flipbook/public')) {
    await next()
    return
  }
  return requireAuthJwt(c, next)
})

type FlipbookManageDenied = {
  ok: false
  status: 401 | 403 | 404 | 503
  error: string
}

type FlipbookManageAllowed = {
  ok: true
  db: D1Database
  userId: string
}

type FlipbookManageResult = FlipbookManageDenied | FlipbookManageAllowed

async function canManageFlipbook(c: Context, albumId: string): Promise<FlipbookManageResult> {
  const db = getD1(c)
  if (!db) return { ok: false, status: 503, error: 'Database not configured' }
  const user = getAuthUserFromContext(c as unknown as import('hono').Context<AppEnv>)
  if (!user) return { ok: false, status: 401, error: 'Unauthorized' }
  const album = await db
    .prepare(`SELECT id, user_id FROM albums WHERE id = ?`)
    .bind(albumId)
    .first<{ id: string; user_id: string }>()
  if (!album) return { ok: false, status: 404, error: 'Album not found' }
  const role = await getRole(c, user)
  const isOwner = album.user_id === user.id || role === 'admin'
  if (isOwner) return { ok: true, db, userId: user.id }
  const member = await db
    .prepare(`SELECT role FROM album_members WHERE album_id = ? AND user_id = ?`)
    .bind(albumId, user.id)
    .first<{ role: string }>()
  if (member?.role === 'admin') return { ok: true, db, userId: user.id }
  return { ok: false, status: 403, error: 'Only administrators can manage flipbook' }
}

function denyFlipbookManage(c: Context, perm: FlipbookManageDenied) {
  return c.json({ error: perm.error }, { status: perm.status })
}

type FlipbookPageSlot = 'front_cover' | 'body' | 'back_cover'

function parseFlipbookPageSlot(body: Record<string, unknown>): FlipbookPageSlot {
  const s = String(body.page_slot ?? 'body').trim()
  if (s === 'front_cover' || s === 'back_cover' || s === 'body') return s
  return 'body'
}

function rowFlipbookSlot(pageSlotRaw: unknown): FlipbookPageSlot {
  if (pageSlotRaw === 'front_cover' || pageSlotRaw === 'back_cover' || pageSlotRaw === 'body')
    return pageSlotRaw
  return 'body'
}

/**
 * Canonical order: front_cover (≤1 kept) → all body rows (sorted by temporary page_number) → back_cover (≤1 kept).
 * Duplicate front/back extras are demoted to body before renumbering 1..n.
 */
async function normalizeManualFlipbookPagesOrder(db: D1Database, albumId: string): Promise<void> {
  type Row = { id: string; page_number: number; page_slot: string | null; created_at: string | null }
  const res = await db
    .prepare(
      `SELECT id, page_number, page_slot, created_at FROM manual_flipbook_pages WHERE album_id = ?`,
    )
    .bind(albumId)
    .all<Row>()
  const rows = res.results ?? []
  if (!rows.length) return

  const fronts = rows
    .filter((r) => rowFlipbookSlot(r.page_slot) === 'front_cover')
    .sort((a, b) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')))
  const backs = rows
    .filter((r) => rowFlipbookSlot(r.page_slot) === 'back_cover')
    .sort((a, b) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')))
  let bodies = rows
    .filter((r) => rowFlipbookSlot(r.page_slot) === 'body')
    .sort((a, b) => a.page_number - b.page_number)

  // Backward-compat: older DB rows may not have page_slot set (all treated as body).
  // If no explicit front/back exists, promote the lowest/highest page_number rows to keep order stable.
  const sortedByNumber = [...rows].sort((a, b) => a.page_number - b.page_number)
  const inferredFront = sortedByNumber[0]
  const inferredBack = sortedByNumber.length > 1 ? sortedByNumber[sortedByNumber.length - 1] : undefined

  const frontKeep = fronts[0] ?? inferredFront
  const backKeep = backs.length ? backs[backs.length - 1] : inferredBack

  const demoted = [...fronts.slice(1), ...backs.slice(0, backs.length ? backs.length - 1 : 0)]
  if (demoted.length) {
    for (const r of demoted) {
      await db
        .prepare(`UPDATE manual_flipbook_pages SET page_slot = 'body' WHERE id = ? AND album_id = ?`)
        .bind(r.id, albumId)
        .run()
    }
    bodies = [...bodies, ...demoted].sort((a, b) => a.page_number - b.page_number)
  }

  let pn = 1
  if (frontKeep) {
    await db
      .prepare(
        `UPDATE manual_flipbook_pages SET page_number = ?, page_slot = 'front_cover' WHERE id = ? AND album_id = ?`,
      )
      .bind(pn++, frontKeep.id, albumId)
      .run()
  }
  for (const b of bodies) {
    if (b.id === frontKeep?.id || b.id === backKeep?.id) continue
    await db
      .prepare(`UPDATE manual_flipbook_pages SET page_number = ?, page_slot = 'body' WHERE id = ? AND album_id = ?`)
      .bind(pn++, b.id, albumId)
      .run()
  }
  if (backKeep) {
    await db
      .prepare(
        `UPDATE manual_flipbook_pages SET page_number = ?, page_slot = 'back_cover' WHERE id = ? AND album_id = ?`,
      )
      .bind(pn++, backKeep.id, albumId)
      .run()
  }
}
// POST /api/albums/:id/flipbook/upload — upload flipbook file to R2 (owner/admin/album-admin)
albumFlipbookRoute.post('/upload', async (c) => {
  const db = getD1(c)
  const bucket = getAssets(c)
  if (!db) return c.json({ error: 'Database not configured' }, 503)
  if (!bucket) return c.json({ error: 'Storage not configured' }, 503)

  const user = getAuthUserFromContext(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)

  const albumId = c.req.param('id')
  if (!albumId) return c.json({ error: 'Album ID required' }, 400)

  const album = await db
    .prepare(`SELECT id, user_id FROM albums WHERE id = ?`)
    .bind(albumId)
    .first<{ id: string; user_id: string }>()
  if (!album) return c.json({ error: 'Album not found' }, 404)

  const role = await getRole(c, user)
  const isOwner = album.user_id === user.id || role === 'admin'
  let isAlbumAdmin = false
  if (!isOwner) {
    const member = await db
      .prepare(`SELECT role FROM album_members WHERE album_id = ? AND user_id = ?`)
      .bind(albumId, user.id)
      .first<{ role: string }>()
    isAlbumAdmin = member?.role === 'admin'
  }
  if (!isOwner && !isAlbumAdmin) {
    return c.json({ error: 'Only administrators can upload flipbook assets' }, 403)
  }

  let fileData: ArrayBuffer | null = null
  let filename = ''
  let mimetype = 'application/octet-stream'
  let target = 'pages'

  try {
    const formData = await c.req.formData()
    const file = formData.get('file')
    if (file != null && typeof file !== 'string') {
      fileData = await (file as Blob).arrayBuffer()
      filename = (file as File).name || 'file.bin'
      mimetype = (file as File).type || 'application/octet-stream'
    }
    const t = formData.get('target')
    if (typeof t === 'string' && t.trim()) target = t.trim().toLowerCase()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return c.json({ error: msg || 'Invalid multipart body' }, 400)
  }

  if (!fileData || fileData.byteLength === 0) return c.json({ error: 'file required' }, 400)
  if (!['pages', 'hotspots'].includes(target)) return c.json({ error: 'Invalid target' }, 400)

  const ext = filename.split('.').pop()?.toLowerCase() || 'bin'
  const safeImageExt = ['jpg', 'jpeg', 'png', 'webp', 'gif']
  const safeVideoExt = ['mp4', 'webm', 'mov', 'm4v']
  const safeExt = [...safeImageExt, ...safeVideoExt].includes(ext) ? ext : 'bin'
  const relPath = `${albumId}/flipbook/${target}/${crypto.randomUUID()}.${safeExt}`

  try {
    await putAlbumPhoto(bucket, relPath, fileData, {
      contentType: mimetype,
      // Key selalu random UUID, aman di-cache lama untuk percepat repeat preview.
      cacheControl: 'public, max-age=31536000, immutable',
    })
  } catch (e: unknown) {
    return c.json({ error: e instanceof Error ? e.message : 'Upload gagal' }, 500)
  }

  return c.json({ file_url: publicAlbumAssetUrl(c, relPath), rel_path: relPath })
})

// POST /api/albums/:id/flipbook/pages — insert page (page_number boleh placeholder; normalize mengatur urutan akhir)
albumFlipbookRoute.post('/pages', async (c) => {
  const albumId = c.req.param('id')
  if (!albumId) return c.json({ error: 'Album ID required' }, 400)
  const perm = await canManageFlipbook(c, albumId)
  if (!perm.ok) return denyFlipbookManage(c, perm as FlipbookManageDenied)
  const body = await c.req.json<Record<string, unknown>>()
  const imageUrl = String(body.image_url ?? '')
  const width = body.width == null ? null : Number(body.width)
  const height = body.height == null ? null : Number(body.height)
  if (!imageUrl) return c.json({ error: 'image_url required' }, 400)

  const pageSlot = parseFlipbookPageSlot(body)
  const bucket = getAssets(c)
  /** Placeholder besar agar tidak tabrakan sampai normalize */
  const tempPageNum = Number.isFinite(Number(body.page_number)) ? Number(body.page_number) : 999_999

  // Cover depan / belakang: satu baris per album; ganti gambar kalau sudah ada
  if (pageSlot === 'front_cover') {
    const existing = await perm.db
      .prepare(`SELECT id, image_url FROM manual_flipbook_pages WHERE album_id = ? AND page_slot = 'front_cover' LIMIT 1`)
      .bind(albumId)
      .first<{ id: string; image_url: string }>()
    if (existing) {
      if (existing.image_url && existing.image_url !== imageUrl && bucket)
        await deleteR2ObjectFromPublicUrl(c, bucket, existing.image_url)
      const upd = await perm.db
        .prepare(
          `UPDATE manual_flipbook_pages SET image_url = ?, width = ?, height = ? WHERE id = ? AND album_id = ?`,
        )
        .bind(imageUrl, width, height, existing.id, albumId)
        .run()
      if (!upd.success) return c.json({ error: 'Update failed' }, 500)
      await normalizeManualFlipbookPagesOrder(perm.db, albumId)
      const row = await perm.db
        .prepare(`SELECT * FROM manual_flipbook_pages WHERE id = ?`)
        .bind(existing.id)
        .first<Record<string, unknown>>()
      return c.json(row)
    }
  }
  if (pageSlot === 'back_cover') {
    const existing = await perm.db
      .prepare(`SELECT id, image_url FROM manual_flipbook_pages WHERE album_id = ? AND page_slot = 'back_cover' LIMIT 1`)
      .bind(albumId)
      .first<{ id: string; image_url: string }>()
    if (existing) {
      if (existing.image_url && existing.image_url !== imageUrl && bucket)
        await deleteR2ObjectFromPublicUrl(c, bucket, existing.image_url)
      const upd = await perm.db
        .prepare(
          `UPDATE manual_flipbook_pages SET image_url = ?, width = ?, height = ? WHERE id = ? AND album_id = ?`,
        )
        .bind(imageUrl, width, height, existing.id, albumId)
        .run()
      if (!upd.success) return c.json({ error: 'Update failed' }, 500)
      await normalizeManualFlipbookPagesOrder(perm.db, albumId)
      const row = await perm.db
        .prepare(`SELECT * FROM manual_flipbook_pages WHERE id = ?`)
        .bind(existing.id)
        .first<Record<string, unknown>>()
      return c.json(row)
    }
  }

  const id = crypto.randomUUID()
  const ins = await perm.db
    .prepare(
      `INSERT INTO manual_flipbook_pages (id, album_id, page_number, image_url, width, height, page_slot, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    )
    .bind(id, albumId, tempPageNum, imageUrl, width, height, pageSlot)
    .run()
  if (!ins.success) return c.json({ error: 'Insert failed' }, 500)
  await normalizeManualFlipbookPagesOrder(perm.db, albumId)
  const row = await perm.db
    .prepare(`SELECT * FROM manual_flipbook_pages WHERE id = ?`)
    .bind(id)
    .first<Record<string, unknown>>()
  return c.json(row)
})

// PATCH /api/albums/:id/flipbook/pages/:pageId — update page
albumFlipbookRoute.patch('/pages/:pageId', async (c) => {
  const albumId = c.req.param('id')
  const pageId = c.req.param('pageId')
  if (!albumId || !pageId) return c.json({ error: 'Album ID and page ID required' }, 400)
  const perm = await canManageFlipbook(c, albumId)
  if (!perm.ok) return denyFlipbookManage(c, perm as FlipbookManageDenied)
  const body = await c.req.json<Record<string, unknown>>()
  const sets: string[] = []
  const vals: unknown[] = []
  if (body.image_url !== undefined) {
    sets.push('image_url = ?')
    vals.push(String(body.image_url ?? ''))
  }
  if (body.page_slot !== undefined) {
    const s = parseFlipbookPageSlot(body)
    sets.push('page_slot = ?')
    vals.push(s)
  }
  if (body.page_number !== undefined) {
    sets.push('page_number = ?')
    vals.push(Number(body.page_number ?? 0))
  }
  if (body.width !== undefined) {
    sets.push('width = ?')
    vals.push(body.width == null ? null : Number(body.width))
  }
  if (body.height !== undefined) {
    sets.push('height = ?')
    vals.push(body.height == null ? null : Number(body.height))
  }
  if (sets.length === 0) return c.json({ error: 'No fields to update' }, 400)

  if (body.image_url !== undefined) {
    const prev = await perm.db
      .prepare(`SELECT image_url FROM manual_flipbook_pages WHERE id = ? AND album_id = ?`)
      .bind(pageId, albumId)
      .first<{ image_url: string }>()
    const bucket = getAssets(c)
    if (prev?.image_url && String(body.image_url ?? '') !== prev.image_url) {
      await deleteR2ObjectFromPublicUrl(c, bucket, prev.image_url)
    }
  }

  vals.push(pageId, albumId)
  const upd = await perm.db
    .prepare(`UPDATE manual_flipbook_pages SET ${sets.join(', ')} WHERE id = ? AND album_id = ?`)
    .bind(...vals)
    .run()
  if (!upd.success) return c.json({ error: 'Update failed' }, 500)
  await normalizeManualFlipbookPagesOrder(perm.db, albumId)
  const row = await perm.db
    .prepare(`SELECT * FROM manual_flipbook_pages WHERE id = ? AND album_id = ?`)
    .bind(pageId, albumId)
    .first<Record<string, unknown>>()
  return c.json(row)
})

// DELETE /api/albums/:id/flipbook/pages/:pageId — hapus satu halaman (+ hotspot + R2)
albumFlipbookRoute.delete('/pages/:pageId', async (c) => {
  const albumId = c.req.param('id')
  const pageId = c.req.param('pageId')
  if (!albumId || !pageId) return c.json({ error: 'Album ID and page ID required' }, 400)
  const perm = await canManageFlipbook(c, albumId)
  if (!perm.ok) return denyFlipbookManage(c, perm as FlipbookManageDenied)

  const page = await perm.db
    .prepare(`SELECT id, image_url FROM manual_flipbook_pages WHERE id = ? AND album_id = ?`)
    .bind(pageId, albumId)
    .first<{ id: string; image_url: string }>()
  if (!page) return c.json({ error: 'Halaman tidak ditemukan' }, 404)

  const bucket = getAssets(c)
  const { results: hotspotRows } = await perm.db
    .prepare(`SELECT video_url FROM flipbook_video_hotspots WHERE page_id = ?`)
    .bind(pageId)
    .all<{ video_url: string | null }>()
  await deleteR2ObjectsFromPublicUrls(c, bucket, (hotspotRows ?? []).map((h) => h.video_url))
  await deleteR2ObjectFromPublicUrl(c, bucket, page.image_url)

  const del = await perm.db
    .prepare(`DELETE FROM manual_flipbook_pages WHERE id = ? AND album_id = ?`)
    .bind(pageId, albumId)
    .run()
  if (!del.success) return c.json({ error: 'Delete failed' }, 500)
  if ((del.meta?.changes ?? 0) === 0) return c.json({ error: 'Halaman tidak ditemukan' }, 404)

  await normalizeManualFlipbookPagesOrder(perm.db, albumId)
  invalidateAlbumCaches(albumId)
  return c.json({ ok: true })
})

// POST /api/albums/:id/flipbook/pages/reorder — set page order by ids
albumFlipbookRoute.post('/pages/reorder', async (c) => {
  const albumId = c.req.param('id')
  if (!albumId) return c.json({ error: 'Album ID required' }, 400)
  const perm = await canManageFlipbook(c, albumId)
  if (!perm.ok) return denyFlipbookManage(c, perm as FlipbookManageDenied)
  const body = await c.req.json<Record<string, unknown>>()
  const pageIds = Array.isArray(body.page_ids)
    ? (body.page_ids as unknown[]).map((v) => String(v))
    : []
  if (!pageIds.length) return c.json({ error: 'page_ids required' }, 400)

  const slotsRes = await perm.db
    .prepare(`SELECT id, page_slot FROM manual_flipbook_pages WHERE album_id = ?`)
    .bind(albumId)
    .all<{ id: string; page_slot: string | null }>()
  const slotById = new Map((slotsRes.results ?? []).map((r) => [r.id, rowFlipbookSlot(r.page_slot)]))

  let frontId = pageIds.find((id) => slotById.get(id) === 'front_cover')
  let backId = [...pageIds].reverse().find((id) => slotById.get(id) === 'back_cover')
  if (!frontId) {
    const r = await perm.db
      .prepare(`SELECT id FROM manual_flipbook_pages WHERE album_id = ? AND page_slot = 'front_cover' LIMIT 1`)
      .bind(albumId)
      .first<{ id: string }>()
    frontId = r?.id
  }
  if (!backId) {
    const r = await perm.db
      .prepare(`SELECT id FROM manual_flipbook_pages WHERE album_id = ? AND page_slot = 'back_cover' LIMIT 1`)
      .bind(albumId)
      .first<{ id: string }>()
    backId = r?.id
  }

  const middle: string[] = []
  for (const id of pageIds) {
    if (id === frontId || id === backId) continue
    middle.push(id)
  }

  let t = 100_000
  for (const id of middle) {
    await perm.db
      .prepare(`UPDATE manual_flipbook_pages SET page_number = ? WHERE id = ? AND album_id = ?`)
      .bind(t++, id, albumId)
      .run()
  }

  await normalizeManualFlipbookPagesOrder(perm.db, albumId)
  return c.json({ ok: true })
})

// POST /api/albums/:id/flipbook/hotspots — insert hotspot
albumFlipbookRoute.post('/hotspots', async (c) => {
  const albumId = c.req.param('id')
  if (!albumId) return c.json({ error: 'Album ID required' }, 400)
  const perm = await canManageFlipbook(c, albumId)
  if (!perm.ok) return denyFlipbookManage(c, perm as FlipbookManageDenied)
  const body = await c.req.json<Record<string, unknown>>()
  const pageId = String(body.page_id ?? '')
  if (!pageId) return c.json({ error: 'page_id required' }, 400)
  const page = await perm.db
    .prepare(`SELECT id FROM manual_flipbook_pages WHERE id = ? AND album_id = ?`)
    .bind(pageId, albumId)
    .first<{ id: string }>()
  if (!page) return c.json({ error: 'Page not found' }, 404)
  const id = crypto.randomUUID()
  const videoUrl = String(body.video_url ?? '')
  const label = String(body.label ?? '')
  const x = Number(body.x ?? 0)
  const y = Number(body.y ?? 0)
  const width = Number(body.width ?? 0)
  const height = Number(body.height ?? 0)
  const ins = await perm.db
    .prepare(
      `INSERT INTO flipbook_video_hotspots (id, page_id, video_url, label, x, y, width, height, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    )
    .bind(id, pageId, videoUrl, label, x, y, width, height)
    .run()
  if (!ins.success) return c.json({ error: 'Insert failed' }, 500)
  const row = await perm.db
    .prepare(`SELECT * FROM flipbook_video_hotspots WHERE id = ?`)
    .bind(id)
    .first<Record<string, unknown>>()
  invalidateAlbumCaches(albumId)
  return c.json(row)
})

// PATCH /api/albums/:id/flipbook/hotspots/:hotspotId — update hotspot
albumFlipbookRoute.patch('/hotspots/:hotspotId', async (c) => {
  const albumId = c.req.param('id')
  const hotspotId = c.req.param('hotspotId')
  if (!albumId || !hotspotId) return c.json({ error: 'Album ID and hotspot ID required' }, 400)
  const perm = await canManageFlipbook(c, albumId)
  if (!perm.ok) return denyFlipbookManage(c, perm as FlipbookManageDenied)
  const owned = await perm.db
    .prepare(
      `SELECT h.id FROM flipbook_video_hotspots h
       INNER JOIN manual_flipbook_pages p ON p.id = h.page_id
       WHERE h.id = ? AND p.album_id = ?`
    )
    .bind(hotspotId, albumId)
    .first<{ id: string }>()
  if (!owned) return c.json({ error: 'Hotspot not found' }, 404)
  const body = await c.req.json<Record<string, unknown>>()
  const sets: string[] = []
  const vals: unknown[] = []
  if (body.video_url !== undefined) {
    sets.push('video_url = ?')
    vals.push(String(body.video_url ?? ''))
  }
  if (body.label !== undefined) {
    sets.push('label = ?')
    vals.push(String(body.label ?? ''))
  }
  if (body.x !== undefined) {
    sets.push('x = ?')
    vals.push(Number(body.x ?? 0))
  }
  if (body.y !== undefined) {
    sets.push('y = ?')
    vals.push(Number(body.y ?? 0))
  }
  if (body.width !== undefined) {
    sets.push('width = ?')
    vals.push(Number(body.width ?? 0))
  }
  if (body.height !== undefined) {
    sets.push('height = ?')
    vals.push(Number(body.height ?? 0))
  }
  if (sets.length === 0) return c.json({ error: 'No fields to update' }, 400)
  vals.push(hotspotId)
  const upd = await perm.db
    .prepare(`UPDATE flipbook_video_hotspots SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...vals)
    .run()
  if (!upd.success) return c.json({ error: 'Update failed' }, 500)

  if (body.video_url !== undefined) {
    const prev = await perm.db
      .prepare(`SELECT video_url FROM flipbook_video_hotspots WHERE id = ?`)
      .bind(hotspotId)
      .first<{ video_url: string | null }>()
    const bucket = getAssets(c)
    if (prev?.video_url && String(body.video_url ?? '') !== prev.video_url) {
      await deleteR2ObjectFromPublicUrl(c, bucket, prev.video_url)
    }
  }

  const row = await perm.db
    .prepare(`SELECT * FROM flipbook_video_hotspots WHERE id = ?`)
    .bind(hotspotId)
    .first<Record<string, unknown>>()
  invalidateAlbumCaches(albumId)
  return c.json(row)
})

// DELETE /api/albums/:id/flipbook/hotspots/:hotspotId — delete hotspot
albumFlipbookRoute.delete('/hotspots/:hotspotId', async (c) => {
  const albumId = c.req.param('id')
  const hotspotId = c.req.param('hotspotId')
  if (!albumId || !hotspotId) return c.json({ error: 'Album ID and hotspot ID required' }, 400)
  const perm = await canManageFlipbook(c, albumId)
  if (!perm.ok) return denyFlipbookManage(c, perm as FlipbookManageDenied)
  const existing = await perm.db
    .prepare(
      `SELECT h.video_url FROM flipbook_video_hotspots h
       INNER JOIN manual_flipbook_pages p ON p.id = h.page_id
       WHERE h.id = ? AND p.album_id = ?`
    )
    .bind(hotspotId, albumId)
    .first<{ video_url: string | null }>()
  if (!existing) return c.json({ error: 'Hotspot not found' }, 404)
  const bucket = getAssets(c)
  await deleteR2ObjectFromPublicUrl(c, bucket, existing.video_url)
  const del = await perm.db
    .prepare(
      `DELETE FROM flipbook_video_hotspots
       WHERE id = ? AND page_id IN (
         SELECT id FROM manual_flipbook_pages WHERE album_id = ?
       )`
    )
    .bind(hotspotId, albumId)
    .run()
  if (!del.success) return c.json({ error: 'Delete failed' }, 500)
  if (del.meta.changes === 0) return c.json({ error: 'Hotspot not found' }, 404)
  invalidateAlbumCaches(albumId)
  return c.json({ ok: true })
})

albumFlipbookRoute.get('/public', async (c) => {
  const albumId = c.req.param('id')
  if (!albumId) return c.json({ error: 'Album ID required' }, 400)
  const db = getD1(c)
  if (!db) return c.json({ error: 'Database not configured' }, 503)

  const now = Date.now()
  const cached = flipbookPublicCache.get(albumId)
  if (cached && cached.expiresAt > now) {
    const clientEtag = c.req.header('If-None-Match')
    if (clientEtag && clientEtag === cached.etag) return new Response(null, { status: 304 })
    c.header('Cache-Control', 'public, max-age=120, stale-while-revalidate=30')
    c.header('ETag', cached.etag)
    c.header('X-Cache', 'HIT')
    return c.json(cached.value)
  }

  try {
    const album = await db
      .prepare(`SELECT id, name FROM albums WHERE id = ?`)
      .bind(albumId)
      .first<{ id: string; name: string }>()
    if (!album) return c.json({ error: 'Album not found' }, 404)

    const { results: pageRows } = await db
      .prepare(`SELECT * FROM manual_flipbook_pages WHERE album_id = ? ORDER BY page_number ASC`)
      .bind(albumId)
      .all<Record<string, unknown>>()
    const pages = pageRows ?? []
    const pageIds = pages.map((p) => p.id as string).filter(Boolean)
    const hotspotsByPage = new Map<string, Record<string, unknown>[]>()
    if (pageIds.length > 0) {
      const ph = pageIds.map(() => '?').join(',')
      const { results: hs } = await db
        .prepare(`SELECT * FROM flipbook_video_hotspots WHERE page_id IN (${ph})`)
        .bind(...pageIds)
        .all<Record<string, unknown>>()
      for (const h of hs ?? []) {
        const pid = h.page_id as string
        const arr = hotspotsByPage.get(pid) ?? []
        arr.push(h)
        hotspotsByPage.set(pid, arr)
      }
    }
    const out = pages.map((p) => ({
      ...p,
      flipbook_video_hotspots: hotspotsByPage.get(p.id as string) ?? [],
    }))
    const payload = { pages: out, albumName: album.name || 'Preview Flipbook' }
    const etag = `"${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}"`
    flipbookPublicCache.set(albumId, {
      value: payload as unknown as Record<string, unknown>,
      expiresAt: now + FLIPBOOK_PUBLIC_TTL_MS,
      etag,
    })
    c.header('Cache-Control', 'public, max-age=120, stale-while-revalidate=30')
    c.header('ETag', etag)
    c.header('X-Cache', 'MISS')
    return c.json(payload)
  } catch {
    return c.json({ error: 'Failed to load flipbook' }, 500)
  }
})

// POST /api/albums/:id/flipbook — clean flipbook assets (admin/owner only)

albumFlipbookRoute.post('/', async (c) => {
  const db = getD1(c)
  if (!db) return c.json({ error: 'Database not configured' }, 503)
  const user = getAuthUserFromContext(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  const albumId = c.req.param('id')
  if (!albumId) return c.json({ error: 'Album ID required' }, 400)

  const album = await db
    .prepare(`SELECT id, user_id FROM albums WHERE id = ?`)
    .bind(albumId)
    .first<{ id: string; user_id: string }>()
  if (!album) return c.json({ error: 'Album not found' }, 404)
  const role = await getRole(c, user)
  const isOwner = album.user_id === user.id || role === 'admin'
  if (!isOwner) {
    const member = await db
      .prepare(`SELECT role FROM album_members WHERE album_id = ? AND user_id = ?`)
      .bind(albumId, user.id)
      .first<{ role: string }>()
    if (!member || member.role !== 'admin') {
      return c.json({ error: 'Only administrators can clean flipbook' }, 403)
    }
  }
  try {
    const bucket = getAssets(c)
    const { results: pageRows } = await db
      .prepare(`SELECT id, image_url FROM manual_flipbook_pages WHERE album_id = ?`)
      .bind(albumId)
      .all<{ id: string; image_url: string }>()
    const pages = pageRows ?? []
    const ids = pages.map((p) => p.id)
    const r2Urls: string[] = pages.map((p) => p.image_url).filter(Boolean)
    if (ids.length > 0) {
      const ph = ids.map(() => '?').join(',')
      const { results: hotspotRows } = await db
        .prepare(`SELECT video_url FROM flipbook_video_hotspots WHERE page_id IN (${ph})`)
        .bind(...ids)
        .all<{ video_url: string | null }>()
      for (const h of hotspotRows ?? []) {
        if (h.video_url) r2Urls.push(h.video_url)
      }
      await db
        .prepare(`DELETE FROM flipbook_video_hotspots WHERE page_id IN (${ph})`)
        .bind(...ids)
        .run()
    }
    await deleteR2ObjectsFromPublicUrls(c, bucket, r2Urls)
    await db.prepare(`DELETE FROM manual_flipbook_pages WHERE album_id = ?`).bind(albumId).run()
    return c.json({
      message: 'Flipbook berhasil dibersihkan (database dan file storage).',
    })
  } catch (error: unknown) {
    return c.json({ error: error instanceof Error ? error.message : 'Internal server error' }, 500)
  }
})

// GET /api/albums/:id/flipbook — get flipbook pages (editor; no in-memory cache — must stay fresh after edits)
albumFlipbookRoute.get('/', async (c) => {
  const db = getD1(c)
  if (!db) return c.json({ error: 'Database not configured' }, 503)
  const albumId = c.req.param('id')

  const { results: pageRows } = await db
    .prepare(`SELECT * FROM manual_flipbook_pages WHERE album_id = ? ORDER BY page_number ASC`)
    .bind(albumId)
    .all<Record<string, unknown>>()
  const pages = pageRows ?? []
  const pageIds = pages.map((p) => p.id as string).filter(Boolean)
  const hotspotsByPage = new Map<string, Record<string, unknown>[]>()
  if (pageIds.length > 0) {
    const ph = pageIds.map(() => '?').join(',')
    const { results: hs } = await db
      .prepare(`SELECT * FROM flipbook_video_hotspots WHERE page_id IN (${ph})`)
      .bind(...pageIds)
      .all<Record<string, unknown>>()
    for (const h of hs ?? []) {
      const pid = h.page_id as string
      const arr = hotspotsByPage.get(pid) ?? []
      arr.push(h)
      hotspotsByPage.set(pid, arr)
    }
  }
  const out = pages.map((p) => ({
    ...p,
    flipbook_video_hotspots: hotspotsByPage.get(p.id as string) ?? [],
  }))
  c.header('Cache-Control', 'no-store')
  return c.json(out)
})

export default albumFlipbookRoute






