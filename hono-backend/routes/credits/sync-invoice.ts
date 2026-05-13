import { Hono } from 'hono'
import { getRole } from '../../lib/auth'
import { getD1 } from '../../lib/edge-env'
import { getCreditsFromD1, setCreditsInD1 } from '../../lib/credits'
import { publishRealtimeEventFromContext } from '../../lib/realtime'
import { AppEnv, requireAuthJwt } from '../../middleware'

const creditsSyncInvoice = new Hono<AppEnv>()
creditsSyncInvoice.use('*', requireAuthJwt)

creditsSyncInvoice.post('/', async (c) => {
  try {
    const db = getD1(c)
    if (!db) return c.json({ error: 'Database not configured' }, 503)
    const user = c.get('user')
    if (!user?.id) return c.json({ error: 'Unauthorized' }, 401)

    const isAdmin = (await getRole(c, user)) === 'admin'

    const { results: pendingRows } = isAdmin
      ? await db
          .prepare(
            `SELECT id, external_id, package_id, amount FROM transactions WHERE status = 'PENDING' LIMIT 400`
          )
          .all<{ id: string; external_id: string; package_id: string | null; amount: number }>()
      : await db
          .prepare(
            `SELECT id, external_id, package_id, amount FROM transactions WHERE user_id = ? AND status = 'PENDING'`
          )
          .bind(user.id)
          .all<{ id: string; external_id: string; package_id: string | null; amount: number }>()

    if (!pendingRows?.length) {
      return c.json({ synced: 0 })
    }

    const xenditKey = (c.env as { XENDIT_SECRET_KEY?: string }).XENDIT_SECRET_KEY || ''
    const auth = btoa(xenditKey + ':')
    let synced = 0

    for (const row of pendingRows) {
      const externalId = row.external_id
      if (!externalId) continue

      try {
        const res = await fetch(
          `https://api.xendit.co/v2/invoices?external_id=${encodeURIComponent(externalId)}`,
          {
            headers: { Authorization: 'Basic ' + auth },
          }
        )
        const invoicesRaw = (await res.json()) as unknown
        const invoice = Array.isArray(invoicesRaw) ? invoicesRaw[0] : invoicesRaw
        const inv = invoice as Record<string, unknown> | undefined

        const invStatus = String(inv?.status ?? '').toUpperCase()

        const specificChannel =
          inv?.payment_channel || inv?.bank_code || inv?.retail_outlet_name || inv?.ewallet_type
        const paymentMethod = (specificChannel || inv?.payment_method || null) as string | null

        // Kadaluarsa / gagal di Xendit: sync ke DB bila webhook tidak jalan (localhost, URL salah, dll.)
        if (invStatus === 'EXPIRED' || invStatus === 'FAILED') {
          await db
            .prepare(
              `UPDATE transactions SET status = ?, payment_method = ?, updated_at = datetime('now') WHERE external_id = ?`
            )
            .bind(invStatus, paymentMethod, externalId)
            .run()

          if (externalId.startsWith('album_')) {
            const match = externalId.match(/^album_(.+?)_user_/)
            const aid = match?.[1]
            if (aid) {
              await db
                .prepare(
                  `UPDATE albums SET payment_url = NULL, updated_at = datetime('now') WHERE id = ? AND payment_url IS NOT NULL`
                )
                .bind(aid)
                .run()
            }
          }

          if (externalId.startsWith('member_')) {
            const accessMatch = externalId.match(/^member_(.+?)_user_/)
            const accessIdFromExt = accessMatch?.[1]
            const txAccess = await db
              .prepare(`SELECT access_id, album_id FROM transactions WHERE external_id = ?`)
              .bind(externalId)
              .first<{ access_id: string | null; album_id: string | null }>()
            const accessId = txAccess?.access_id ?? accessIdFromExt
            const albumId = txAccess?.album_id
            if (accessId) {
              await db
                .prepare(
                  `UPDATE album_class_access SET payment_status = 'unpaid', payment_transaction_id = NULL, updated_at = datetime('now') WHERE id = ? AND payment_status = 'pending'`
                )
                .bind(accessId)
                .run()
            }
            if (albumId && accessId) {
              void publishRealtimeEventFromContext(c, {
                type: 'album.classAccess.updated',
                channel: 'global',
                payload: {
                  path: `/api/albums/${albumId}/join-requests`,
                  albumId,
                  accessId,
                  paymentStatus: 'unpaid',
                },
                ts: new Date().toISOString(),
              })
            }
          }

          synced++
          continue
        }

        if (invStatus !== 'PAID' && invStatus !== 'SETTLED') continue

        const isPackage = externalId.startsWith('pkg_')
        const isAlbum = externalId.startsWith('album_')

        if (isPackage) {
          const match = externalId.match(/^pkg_(.+?)_user_(.+?)_ts_/)
          if (!match) continue
          const packageId = match[1]
          const userId = match[2]

          const pkg = await db
            .prepare(`SELECT credits FROM credit_packages WHERE id = ?`)
            .bind(packageId)
            .first<{ credits: number }>()

          if (!pkg) continue

          const paidAt = new Date().toISOString()
          await db
            .prepare(
              `UPDATE transactions SET status = ?, payment_method = ?, paid_at = ?, updated_at = datetime('now') WHERE external_id = ?`
            )
            .bind(invStatus, paymentMethod, paidAt, externalId)
            .run()

          const currentCredits = await getCreditsFromD1(db, userId)
          const newCredits = currentCredits + (pkg.credits ?? 0)
          await setCreditsInD1(db, userId, newCredits)
          synced++
        } else if (isAlbum) {
          const match = externalId.match(/^album_(.+?)_user_(.+?)_ts_/)
          if (!match) continue
          const albumId = match[1]

          const paidAt = new Date().toISOString()
          await db
            .prepare(
              `UPDATE transactions SET status = ?, payment_method = ?, paid_at = ?, updated_at = datetime('now') WHERE external_id = ?`
            )
            .bind(invStatus, paymentMethod, paidAt, externalId)
            .run()

          const txRow = await db
            .prepare(`SELECT new_students_count, amount FROM transactions WHERE external_id = ?`)
            .bind(externalId)
            .first<{ new_students_count: number | null; amount: number }>()

          if (txRow?.new_students_count) {
            await db
              .prepare(
                `UPDATE albums SET payment_status = 'paid', students_count = ?, total_estimated_price = total_estimated_price + ?, updated_at = datetime('now') WHERE id = ?`
              )
              .bind(txRow.new_students_count, txRow.amount, albumId)
              .run()
          } else {
            await db
              .prepare(
                `UPDATE albums SET payment_status = 'paid', updated_at = datetime('now') WHERE id = ?`
              )
              .bind(albumId)
              .run()
          }

          synced++
        }
      } catch (e) {
        console.warn('Sync invoice failed for', externalId, e)
      }
    }

    return c.json({ synced })
  } catch (error: unknown) {
    console.error('Sync invoice error:', error)
    return c.json({ error: error instanceof Error ? error.message : 'Sync failed' }, 500)
  }
})

export default creditsSyncInvoice






