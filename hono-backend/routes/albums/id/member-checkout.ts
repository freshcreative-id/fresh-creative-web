import { Hono } from 'hono'
import { getD1 } from '../../../lib/edge-env'
import { getPublicAppUrl } from '../../../lib/public-url'
import { publishRealtimeEventFromContext } from '../../../lib/realtime'
import { AppEnv, requireAuthJwt } from '../../../middleware'
import { getAuthUserFromContext } from '../../../lib/auth-user'

const memberCheckoutRoute = new Hono<AppEnv>()
memberCheckoutRoute.use('*', requireAuthJwt)

memberCheckoutRoute.post('/', async (c) => {
  try {
    const albumId = c.req.param('id')
    if (!albumId) return c.json({ error: 'Album ID required' }, 400)

    const db = getD1(c)
    if (!db) return c.json({ error: 'Database not configured' }, 503)

    const user = getAuthUserFromContext(c)
    if (!user) return c.json({ error: 'Unauthorized' }, 401)

    const body = await c.req.json().catch(() => ({}))
    const { access_id } = body
    if (!access_id) return c.json({ error: 'Access ID required' }, 400)

    // Verify access exists, belongs to user, and is unpaid
    const access = await db
      .prepare(`SELECT * FROM album_class_access WHERE id = ? AND album_id = ? AND user_id = ?`)
      .bind(access_id, albumId, user.id)
      .first<Record<string, unknown>>()

    if (!access) return c.json({ error: 'Access record not found' }, 404)
    if (access.has_paid) return c.json({ error: 'Already paid' }, 400)
    if (access.status !== 'approved') return c.json({ error: 'Access not approved yet' }, 400)

    // Get album and package price
    const album = await db
      .prepare(
        `
        SELECT a.name, a.individual_payments_enabled, a.package_snapshot, a.discount_percent_off, a.total_estimated_price, a.students_count
        FROM albums a
        WHERE a.id = ?
      `
      )
      .bind(albumId)
      .first<{
        name: string
        individual_payments_enabled?: number
        package_snapshot?: string
        discount_percent_off?: number
        total_estimated_price?: number
        students_count?: number
      }>()

    if (!album) return c.json({ error: 'Album not found' }, 404)
    if (album.individual_payments_enabled === 0) {
      return c.json({ error: 'Album does not require individual payments' }, 400)
    }

    const discountPercent = Number(album.discount_percent_off ?? 0)
    const hasDiscount = Number.isFinite(discountPercent) && discountPercent > 0 && discountPercent < 100
    const storedTotal = Number(album.total_estimated_price ?? 0)
    const storedStudentsCount = Number(album.students_count ?? 0)
    const storedAmountPerStudent =
      Number.isFinite(storedTotal) && storedTotal > 0 && Number.isFinite(storedStudentsCount) && storedStudentsCount > 0
        ? Math.round(storedTotal / storedStudentsCount)
        : 0

    let amount = 0
    const lineItems: Array<{ name: string; quantity: number; price: number }> = []
    let calculatedSubtotal = 0

    if (album.package_snapshot) {
      try {
        const pkg = JSON.parse(album.package_snapshot)
        if (pkg.price_per_student) {
          const baseP = Number(pkg.price_per_student)
          lineItems.push({
            name: `Paket Dasar`,
            quantity: 1,
            price: baseP,
          })
          calculatedSubtotal += baseP
        }

        if (pkg.features && Array.isArray(pkg.features)) {
          for (const f of pkg.features) {
            try {
              const j = typeof f === 'string' ? JSON.parse(f) : f
              if (j.price > 0 || Number(j.price) > 0) {
                const addonP = Number(j.price)
                lineItems.push({
                  name: `Add-on: ${j.name}`,
                  quantity: 1,
                  price: addonP,
                })
                calculatedSubtotal += addonP
              }
            } catch {
              /* ignore individual addon parse error */
            }
          }
        }
      } catch {
        /* ignore snapshot parse error */
      }
    }

    const calculatedAmount = hasDiscount
      ? Math.max(0, Math.round(calculatedSubtotal * (1 - discountPercent / 100)))
      : calculatedSubtotal
    amount = storedAmountPerStudent > 0 ? storedAmountPerStudent : calculatedAmount

    const subtotalBeforeDiscount = hasDiscount && amount > 0
      ? Math.round(amount / (1 - discountPercent / 100))
      : amount

    if (lineItems.length === 0 || Math.abs(calculatedSubtotal - subtotalBeforeDiscount) > 1) {
      lineItems.splice(0, lineItems.length, {
        name: `${album.name} Access Payment`,
        quantity: 1,
        price: subtotalBeforeDiscount || amount,
      })
    }

    if (amount <= 0) {
      // If free, just approve immediately
      await db
        .prepare(
          `UPDATE album_class_access SET has_paid = 1, payment_status = 'paid', updated_at = datetime('now') WHERE id = ?`
        )
        .bind(access_id)
        .run()
      void publishRealtimeEventFromContext(c, {
        type: 'album.classAccess.updated',
        channel: 'global',
        payload: {
          path: `/api/albums/${albumId}/join-requests`,
          albumId,
          accessId: access_id,
          paymentStatus: 'paid',
        },
        ts: new Date().toISOString(),
      })
      return c.json({ free: true, message: 'Free access granted' })
    }

    const externalId = `member_${access_id}_user_${user.id}_ts_${Date.now()}`
    const txId = crypto.randomUUID()
    const discountAmount = hasDiscount ? Math.max(0, subtotalBeforeDiscount - amount) : 0
    const descBase = `Pembayaran Akses Anggota Album: ${album.name}`
    const desc = descBase

    const xenditKey = (c.env as { XENDIT_SECRET_KEY?: string }).XENDIT_SECRET_KEY || ''
    if (!xenditKey) return c.json({ error: 'XENDIT_SECRET_KEY missing' }, 500)

    const baseUrl = getPublicAppUrl(c)
    if (!baseUrl) {
      return c.json(
        {
          error:
            'Could not determine app URL. Set NEXT_PUBLIC_APP_URL on the Worker or open checkout from the deployed site.',
        },
        500
      )
    }
    const redirectPath = '/user/riwayat' // Member dashboard or history

    const invoicePayload: Record<string, unknown> = {
      external_id: externalId,
      amount: amount,
      currency: 'IDR',
      description: desc,
      success_redirect_url: `${baseUrl}${redirectPath}?status=success`,
      failure_redirect_url: `${baseUrl}${redirectPath}?status=failed`,
      items: lineItems,
    }
    if (hasDiscount && discountAmount > 0) {
      lineItems.push({
        name: `Diskon ${discountPercent}%`,
        quantity: 1,
        price: -discountAmount,
      })
      invoicePayload.metadata = {
        discount_percent_off: discountPercent,
        subtotal_before_discount: subtotalBeforeDiscount,
        discount_amount: discountAmount,
        total_after_discount: amount,
      }
    }

    if (user.email) {
      invoicePayload.payer_email = user.email
      invoicePayload.customer = {
        given_names: user.user_metadata?.full_name || 'Customer',
        email: user.email,
      }
    }

    const auth = btoa(xenditKey + ':')
    const xenditRes = await fetch('https://api.xendit.co/v2/invoices', {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + auth,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(invoicePayload),
    })

    const invoice = (await xenditRes.json()) as { message?: string; invoice_url?: string }
    if (!xenditRes.ok) {
      return c.json({ error: invoice?.message || 'Failed to create invoice' }, 500)
    }

    const invoiceUrl = invoice.invoice_url
    if (!invoiceUrl) return c.json({ error: 'Xendit did not return invoice_url' }, 500)

    // Store transaction with access_id
    await db
      .prepare(
        `INSERT INTO transactions (id, user_id, external_id, album_id, amount, status, invoice_url, description, access_id, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, datetime('now'), datetime('now'))`
      )
      .bind(txId, user.id, externalId, albumId, amount, invoiceUrl, desc, access_id)
      .run()

    // Mark as pending
    await db
      .prepare(
        `UPDATE album_class_access SET payment_status = 'pending', payment_transaction_id = ?, updated_at = datetime('now') WHERE id = ?`
      )
      .bind(txId, access_id)
      .run()

    void publishRealtimeEventFromContext(c, {
      type: 'album.classAccess.updated',
      channel: 'global',
      payload: {
        path: `/api/albums/${albumId}/join-requests`,
        albumId,
        accessId: access_id,
        paymentStatus: 'pending',
      },
      ts: new Date().toISOString(),
    })

    return c.json({ invoiceUrl })
  } catch (error: unknown) {
    return c.json({ error: error instanceof Error ? error.message : 'Internal server error' }, 500)
  }
})

export default memberCheckoutRoute





