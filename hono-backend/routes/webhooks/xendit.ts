import { Hono } from 'hono'
import { getD1 } from '../../lib/edge-env'
import { getCreditsFromD1, setCreditsInD1 } from '../../lib/credits'
import { publishRealtimeEventFromContext } from '../../lib/realtime'

const webhooksXendit = new Hono()

/** Status invoice yang mengunci transaksi sebagai tidak bisa dibayar (expired, void, gagal, dll.) */
const TERMINAL_NON_PAYMENT_STATUSES = new Set([
  'EXPIRED',
  'FAILED',
  'VOID',
  'VOIDED',
  'CANCELLED',
  'CANCELED',
])

function extractMemberAccessId(externalId: string): string | null {
  const match = externalId.match(/^member_(.+?)_user_/)
  return match?.[1] ?? null
}

// POST /api/webhooks/xendit
webhooksXendit.post('/', async (c) => {
  const payload = await c.req.json()
  const raw = payload?.data ?? payload
  const status = (raw?.status ?? payload?.status ?? '').toUpperCase()
  const externalId = raw?.external_id ?? payload?.external_id
  const specificChannel =
    raw?.payment_channel || raw?.bank_code || raw?.retail_outlet_name || raw?.ewallet_type
  const paymentMethod = specificChannel || raw?.payment_method || null

  if (!externalId) {
    return c.json({ error: 'No external_id provided' }, 400)
  }

  const db = getD1(c)
  if (!db) return c.json({ error: 'Database not configured' }, 503)

  const memberAccessIdFromExternal = externalId.startsWith('member_')
    ? extractMemberAccessId(externalId)
    : null

  if (TERMINAL_NON_PAYMENT_STATUSES.has(status)) {
    let tx: { album_id: string | null; access_id: string | null } | null = null

    try {
      tx = await db
        .prepare(`SELECT album_id, access_id FROM transactions WHERE external_id = ?`)
        .bind(externalId)
        .first<{ album_id: string | null; access_id: string | null }>()
    } catch {
      const fallback = await db
        .prepare(`SELECT album_id FROM transactions WHERE external_id = ?`)
        .bind(externalId)
        .first<{ album_id: string | null }>()
      tx = fallback
        ? {
            album_id: fallback.album_id,
            access_id: memberAccessIdFromExternal,
          }
        : null
    }

    await db
      .prepare(
        `UPDATE transactions SET status = ?, updated_at = datetime('now') WHERE external_id = ?`
      )
      .bind(status, externalId)
      .run()

    if (tx) {
      if (tx.album_id && externalId.startsWith('album_')) {
        await db
          .prepare(`UPDATE albums SET payment_url = NULL, updated_at = datetime('now') WHERE id = ? AND payment_url IS NOT NULL`)
          .bind(tx.album_id)
          .run()

        void publishRealtimeEventFromContext(c, {
          type: 'api.mutated',
          channel: 'global',
          payload: {
            path: `/api/albums/${tx.album_id}`,
            albumId: tx.album_id,
            invoiceStatus: status,
          },
          ts: new Date().toISOString(),
        })
      }
      if (tx.access_id && externalId.startsWith('member_')) {
        await db
          .prepare(`UPDATE album_class_access SET payment_status = 'unpaid', payment_transaction_id = NULL, updated_at = datetime('now') WHERE id = ? AND payment_status = 'pending'`)
          .bind(tx.access_id)
          .run()

        void publishRealtimeEventFromContext(c, {
          type: 'album.classAccess.updated',
          channel: 'global',
          payload: {
            path: `/api/albums/${tx.album_id}/join-requests`,
            albumId: tx.album_id,
            accessId: tx.access_id,
            paymentStatus: 'unpaid',
          },
          ts: new Date().toISOString(),
        })
      }
    }

    // Top-up credits (pkg_): supaya riwayat refresh lewat listener realtime
    if (externalId.startsWith('pkg_')) {
      void publishRealtimeEventFromContext(c, {
        type: 'api.mutated',
        channel: 'global',
        payload: {
          path: '/api/credits/',
          externalId,
          invoiceStatus: status,
        },
        ts: new Date().toISOString(),
      })
    }

    return c.json({ message: 'Terminal non-payment status handled', status }, 200)
  }

  if (status !== 'PAID' && status !== 'SETTLED') {
    return c.json({ message: 'Ignored, unhandled status', received: status })
  }

  const isPackage = externalId.startsWith('pkg_')
  const isAlbum = externalId.startsWith('album_')
  const isMember = externalId.startsWith('member_')

  // Update for terminal statuses
  if (status === 'PAID' || status === 'SETTLED') {
    await db
      .prepare(
        `UPDATE transactions
         SET status = ?, payment_method = ?, paid_at = datetime('now'), updated_at = datetime('now')
         WHERE external_id = ?`
      )
      .bind(status, paymentMethod, externalId)
      .run()

    let txRow: {
      package_id: string | null
      album_id: string | null
      new_students_count: number | null
      amount: number
      access_id: string | null
    } | null = null

    try {
      txRow = await db
        .prepare(
          `SELECT package_id, album_id, new_students_count, amount, access_id FROM transactions WHERE external_id = ?`
        )
        .bind(externalId)
        .first<{
          package_id: string | null
          album_id: string | null
          new_students_count: number | null
          amount: number
          access_id: string | null
        }>()
    } catch {
      const fallback = await db
        .prepare(
          `SELECT package_id, album_id, new_students_count, amount FROM transactions WHERE external_id = ?`
        )
        .bind(externalId)
        .first<{
          package_id: string | null
          album_id: string | null
          new_students_count: number | null
          amount: number
        }>()
      txRow = fallback
        ? {
            ...fallback,
            access_id: memberAccessIdFromExternal,
          }
        : null
    }

    if (txRow?.package_id && isPackage) {
      const pkg = await db
        .prepare(`SELECT credits FROM credit_packages WHERE id = ?`)
        .bind(txRow.package_id)
        .first<{ credits: number }>()

      if (pkg?.credits) {
        const userId = await db
          .prepare(`SELECT user_id FROM transactions WHERE external_id = ?`)
          .bind(externalId)
          .first<{ user_id: string }>()

        if (userId?.user_id) {
          const currentCredits = await getCreditsFromD1(db, userId.user_id)
          const nextCredits = currentCredits + pkg.credits
          await setCreditsInD1(db, userId.user_id, nextCredits)
        }
      }

      void publishRealtimeEventFromContext(c, {
        type: 'api.mutated',
        channel: 'global',
        payload: {
          path: '/api/credits/',
          externalId,
          invoiceStatus: status,
        },
        ts: new Date().toISOString(),
      })
    }

    if (txRow?.album_id && isAlbum) {
      if (typeof txRow.new_students_count === 'number' && txRow.new_students_count > 0) {
        await db
          .prepare(
            `UPDATE albums
             SET payment_status = 'paid', students_count = ?, total_estimated_price = total_estimated_price + ?, updated_at = datetime('now')
             WHERE id = ?`
          )
          .bind(txRow.new_students_count, txRow.amount, txRow.album_id)
          .run()
      } else {
        await db
          .prepare(
            `UPDATE albums
             SET payment_status = 'paid', updated_at = datetime('now')
             WHERE id = ?`
          )
          .bind(txRow.album_id)
          .run()
      }

      // Realtime: refresh editor/public UI without manual reload.
      void publishRealtimeEventFromContext(c, {
        type: 'api.mutated',
        channel: 'global',
        payload: {
          path: `/api/albums/${txRow.album_id}`,
          albumId: txRow.album_id,
          paymentStatus: 'paid',
        },
        ts: new Date().toISOString(),
      })
    }

    if (txRow?.album_id && txRow?.access_id && isMember) {
      await db
        .prepare(
          `UPDATE album_class_access
           SET has_paid = 1, payment_status = 'paid', updated_at = datetime('now')
           WHERE id = ?`
        )
        .bind(txRow.access_id)
        .run()

      void publishRealtimeEventFromContext(c, {
        type: 'album.classAccess.updated',
        channel: 'global',
        payload: {
          path: `/api/albums/${txRow.album_id}/join-requests`,
          albumId: txRow.album_id,
          accessId: txRow.access_id,
          paymentStatus: 'paid',
        },
        ts: new Date().toISOString(),
      })
    }

    return c.json({
      message: 'Webhook processed',
      status,
      externalId,
      paymentMethod,
      isPackage,
      isAlbum,
      isMember,
    })
  }

  // Ignore non-terminal statuses
  return c.json({
    message: 'Webhook received',
    status,
    externalId,
    paymentMethod,
    isPackage,
    isAlbum,
    isMember,
  })
})

export default webhooksXendit






