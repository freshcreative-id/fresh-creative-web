import { Hono } from 'hono'
import { getD1 } from '../../../lib/edge-env'
import { publishRealtimeEventFromContext } from '../../../lib/realtime'
import { AppEnv, requireAuthJwt } from '../../../middleware'
import { getAuthUserFromContext } from '../../../lib/auth-user'
import { getRole } from '../../../lib/auth'

const joinRequestsRequestId = new Hono<AppEnv>()
joinRequestsRequestId.use('*', requireAuthJwt)

joinRequestsRequestId.patch('/', async (c) => {
  try {
    const albumId = c.req.param('id')
    const requestId = c.req.param('requestId')
    const body = await c.req.json()
    const { action, assigned_class_id, rejected_reason } = body

    if (!action || !['approve', 'reject'].includes(action)) {
      return c.json({ error: 'Action harus "approve" atau "reject"' }, 400)
    }

    const db = getD1(c)
    if (!db) return c.json({ error: 'Database not configured' }, 503)

    const user = getAuthUserFromContext(c)
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    const album = await db
      .prepare(`SELECT user_id, individual_payments_enabled FROM albums WHERE id = ?`)
      .bind(albumId)
      .first<{ user_id: string; individual_payments_enabled?: number }>()
    if (!album) return c.json({ error: 'Album tidak ditemukan' }, 404)

    // Cek apakah user adalah global admin
    const userRole = await getRole(c, user)
    const isGlobalAdmin = userRole === 'admin'

    const isOwner = album.user_id === user.id
    if (!isOwner && !isGlobalAdmin) {
      const member = await db
        .prepare(`SELECT role FROM album_members WHERE album_id = ? AND user_id = ?`)
        .bind(albumId, user.id)
        .first<{ role: string }>()
      if (!member || member.role !== 'admin') {
        return c.json({ error: 'Forbidden' }, 403)
      }
    }

    const joinRequest = await db
      .prepare(`SELECT * FROM album_join_requests WHERE id = ? AND album_id = ?`)
      .bind(requestId, albumId)
      .first<Record<string, unknown>>()

    if (!joinRequest) {
      return c.json({ error: 'Request tidak ditemukan' }, 404)
    }

    if (joinRequest.status !== 'pending') {
      return c.json({ error: 'Request sudah diproses sebelumnya' }, 400)
    }

    if (action === 'approve') {
      if (!assigned_class_id) {
        return c.json({ error: 'Class ID wajib diisi saat approve' }, 400)
      }

      const classData = await db
        .prepare(`SELECT id FROM album_classes WHERE id = ? AND album_id = ?`)
        .bind(assigned_class_id, albumId)
        .first<{ id: string }>()

      if (!classData) {
        return c.json({ error: 'Class tidak valid' }, 400)
      }

      if (joinRequest.user_id) {
        const existingAccess = await db
          .prepare(
            `SELECT id FROM album_class_access WHERE album_id = ? AND class_id = ? AND user_id = ?`
          )
          .bind(albumId, assigned_class_id, joinRequest.user_id as string)
          .first<{ id: string }>()

        if (existingAccess) {
          return c.json({ error: 'User sudah memiliki akses ke kelas ini' }, 400)
        }

        const accessId = crypto.randomUUID()
        const hasPaid = album.individual_payments_enabled ? 0 : 1
        const pStatus = album.individual_payments_enabled ? 'unpaid' : 'paid'

        const ins = await db
          .prepare(
            `INSERT INTO album_class_access (id, album_id, class_id, user_id, student_name, email, status, photos, has_paid, payment_status, created_at, updated_at) 
             VALUES (?, ?, ?, ?, ?, ?, 'approved', '[]', ?, ?, datetime('now'), datetime('now'))`
          )
          .bind(
            accessId,
            albumId,
            assigned_class_id,
            joinRequest.user_id,
            joinRequest.student_name,
            joinRequest.email ?? null,
            hasPaid,
            pStatus
          )
          .run()

        if (!ins.success) {
          console.error('Error creating access')
          return c.json({ error: 'Gagal menambahkan akses ke kelas' }, 500)
        }

        await db
          .prepare(
            `INSERT OR REPLACE INTO album_members (album_id, user_id, role, joined_at) VALUES (?, ?, 'member', datetime('now'))`
          )
          .bind(albumId, joinRequest.user_id)
          .run()

        await db.prepare(`DELETE FROM album_join_requests WHERE id = ?`).bind(requestId).run()

        const albumData = await db
          .prepare(`SELECT name FROM albums WHERE id = ?`)
          .bind(albumId)
          .first<{ name: string }>()

        const notifId = crypto.randomUUID()
        await db
          .prepare(
            `INSERT INTO notifications (id, user_id, title, message, type, metadata, created_at)
             VALUES (?, ?, ?, ?, 'success', ?, datetime('now'))`
          )
          .bind(
            notifId,
            joinRequest.user_id as string,
            'Status Pendaftaran Album',
            `${albumData?.name || 'Album'}\n${joinRequest.student_name}${joinRequest.class_name ? ` - ${joinRequest.class_name}` : ''}\n${joinRequest.email}`,
            JSON.stringify({ status: 'Disetujui' })
          )
          .run()

        // Broadcast approve ke semua device
        void publishRealtimeEventFromContext(c, {
          type: 'album.joinRequest.updated',
          channel: 'global',
          payload: { 
            path: `/api/albums/${albumId}/join-requests`, 
            action: 'approve',
            albumId
          },
          ts: new Date().toISOString(),
        })

        return c.json({
          success: true,
          message: 'Request disetujui dan user ditambahkan ke kelas',
        })
      }
      return c.json({ error: 'User ID tidak ditemukan pada request' }, 400)
    }

    const upd = await db
      .prepare(
        `UPDATE album_join_requests SET status = 'rejected', rejected_reason = ?, approved_by = ? WHERE id = ? AND album_id = ?`
      )
      .bind(rejected_reason || null, user.id, requestId, albumId)
      .run()
    if (!upd.success) {
      return c.json({ error: 'Gagal menolak request' }, 500)
    }

    if (joinRequest.user_id) {
      const albumData = await db
        .prepare(`SELECT name FROM albums WHERE id = ?`)
        .bind(albumId)
        .first<{ name: string }>()
      const notifId = crypto.randomUUID()
      await db
        .prepare(
          `INSERT INTO notifications (id, user_id, title, message, type, metadata, created_at)
           VALUES (?, ?, ?, ?, 'error', ?, datetime('now'))`
        )
        .bind(
          notifId,
          joinRequest.user_id as string,
          'Status Pendaftaran Album',
          `${albumData?.name || 'Album'}\n${joinRequest.student_name}${joinRequest.class_name ? ` - ${joinRequest.class_name}` : ''}\n${joinRequest.email}`,
          JSON.stringify({ status: 'Ditolak', reason: rejected_reason })
        )
        .run()
    }

    // Broadcast reject ke semua device
    void publishRealtimeEventFromContext(c, {
      type: 'album.joinRequest.updated',
      channel: 'global',
      payload: { 
        path: `/api/albums/${albumId}/join-requests`, 
        action: 'reject',
        albumId
      },
      ts: new Date().toISOString(),
    })

    return c.json({
      success: true,
      message: 'Request ditolak',
    })
  } catch (error: unknown) {
    console.error('Error processing join request:', error)
    return c.json({ error: error instanceof Error ? error.message : 'Terjadi kesalahan' }, 500)
  }
})

joinRequestsRequestId.delete('/', async (c) => {
  try {
    const albumId = c.req.param('id')
    const requestId = c.req.param('requestId')
    const db = getD1(c)
    if (!db) return c.json({ error: 'Database not configured' }, 503)

    const r = await db
      .prepare(`DELETE FROM album_join_requests WHERE id = ? AND album_id = ?`)
      .bind(requestId, albumId)
      .run()
    if (!r.success) throw new Error('delete failed')

    void publishRealtimeEventFromContext(c, {
      type: 'album.joinRequest.updated',
      channel: 'global',
      payload: {
        path: `/api/albums/${albumId}/join-requests`,
        action: 'delete',
        albumId,
        requestId,
      },
      ts: new Date().toISOString(),
    })

    return c.json({ success: true })
  } catch (error) {
    console.error('Error deleting join request:', error)
    return c.json({ error: 'Failed to delete request' })
  }
})

export default joinRequestsRequestId





