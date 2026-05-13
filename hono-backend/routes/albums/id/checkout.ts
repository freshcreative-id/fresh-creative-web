import { Hono } from 'hono'
import { getRole } from '../../../lib/auth'
import { getD1 } from '../../../lib/edge-env'
import { getPublicAppUrl } from '../../../lib/public-url'
import { AppEnv, requireAuthJwt } from '../../../middleware'
import { getAuthUserFromContext } from '../../../lib/auth-user'

const checkoutRoute = new Hono<AppEnv>()
checkoutRoute.use('*', requireAuthJwt)

checkoutRoute.post('/', async (c) => {
  try {
    const albumId = c.req.param('id')
    if (!albumId) return c.json({ error: 'Album ID required' }, 400)

    const db = getD1(c)
    if (!db) return c.json({ error: 'Database not configured' }, 503)
    const user = getAuthUserFromContext(c)
    if (!user) return c.json({ error: 'Unauthorized' }, 401)

    const album = await db
      .prepare(`SELECT * FROM albums WHERE id = ?`)
      .bind(albumId)
      .first<Record<string, unknown>>()
    if (!album) return c.json({ error: 'Album not found' }, 404)

    if (album.user_id !== user.id) {
      if ((await getRole(c, user)) !== 'admin') return c.json({ error: 'Forbidden' }, 403)
    }

    if (album.status !== 'approved')
      return c.json({ error: 'Album must be approved before payment' }, 400)

    const body = await c.req.json().catch(() => ({}))
    const isUpgradeRequest = body.upgrade === true

    if (album.payment_status === 'paid' && !isUpgradeRequest) {
      return c.json({ error: 'Album already paid' }, 400)
    }

    let amount = isUpgradeRequest ? body.amount || 0 : Number(album.total_estimated_price)

    // Fallback: Jika album lama masih menyimpan total_estimated_price untuk banyak siswa,
    // maka kita bagi dengan students_count (selama individual_payments_enabled tidak 0/false).
    if (
      !isUpgradeRequest &&
      album.individual_payments_enabled !== 0 &&
      album.students_count &&
      (album.students_count as number) > 1
    ) {
      amount = amount / (album.students_count as number)
      // Removed the destructive UPDATE statement which caused the price to cascade every time checkout was clicked.
    }
    if (!amount || (amount as number) <= 0) return c.json({ error: 'Invalid album price' }, 400)

    const existingTx = await db
      .prepare(
        `SELECT invoice_url FROM transactions WHERE album_id = ? AND status = 'PENDING' AND amount = ? AND created_at >= datetime('now', '-23 hours') ORDER BY created_at DESC LIMIT 1`
      )
      .bind(albumId, amount)
      .first<{ invoice_url: string | null }>()

    if (existingTx?.invoice_url) {
      const url = existingTx.invoice_url
      const isStubbed = url.includes('stubbed-url') || url.includes('sandbox.xendit.co')
      if (!isStubbed) return c.json({ invoiceUrl: url })
      // Abaikan transaksi stub lama (hindari browser membuka domain yang tidak resolve).
      await db
        .prepare(
          `UPDATE transactions SET status = 'FAILED', updated_at = datetime('now') WHERE album_id = ? AND invoice_url = ? AND status = 'PENDING'`
        )
        .bind(albumId, url)
        .run()
    }

    const externalId = `album_${album.id}_user_${user.id}_ts_${Date.now()}`
    const txId = crypto.randomUUID()
    const discountPercent = !isUpgradeRequest ? Number(album.discount_percent_off ?? 0) : 0
    const hasDiscount = Number.isFinite(discountPercent) && discountPercent > 0 && discountPercent < 100
    const amountNumber = Number(amount)
    const subtotalBeforeDiscount = hasDiscount
      ? Math.round(amountNumber / (1 - discountPercent / 100))
      : amountNumber
    const discountAmount = hasDiscount ? Math.max(0, subtotalBeforeDiscount - amountNumber) : 0

    const descBase = isUpgradeRequest
      ? `Penambahan ${body.added_students || 0} Anggota Album: ${album.name}`
      : `Pembayaran Album (Akses Kreator): ${album.name}`
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
    const isAdmin = (await getRole(c, user)) === 'admin'
    const redirectPath = isAdmin ? '/admin/riwayat' : '/user/riwayat'

    const itemsQuantity = isUpgradeRequest ? (body.added_students || 1) : 1;
    let lineItems: Array<{ name: string; quantity: number; price: number }> = [];
    let totalCalculated = 0;

    try {
      if (album.package_snapshot) {
        const pkg = JSON.parse(album.package_snapshot as string);
        
        if (pkg.price_per_student) {
          const baseP = Number(pkg.price_per_student);
          lineItems.push({
            name: `Paket Dasar`,
            quantity: itemsQuantity,
            price: baseP,
          });
          totalCalculated += baseP * itemsQuantity;
        }

        if (pkg.features && Array.isArray(pkg.features)) {
          for (const f of pkg.features) {
            try {
              const j = typeof f === 'string' ? JSON.parse(f) : f;
              if (j.price > 0 || Number(j.price) > 0) {
                const addonP = Number(j.price);
                lineItems.push({
                  name: `Add-on: ${j.name}`,
                  quantity: itemsQuantity,
                  price: addonP,
                });
                totalCalculated += addonP * itemsQuantity;
              }
            } catch { /* ignore individual addon parse error */ }
          }
        }
      }
    } catch { /* ignore snapshot parse error */ }

    const amountForCompare = hasDiscount ? subtotalBeforeDiscount : amountNumber
    if (lineItems.length === 0 || totalCalculated !== amountForCompare) {
      lineItems = [
        {
          name: isUpgradeRequest
            ? `Penambahan ${itemsQuantity} Anggota: ${album.name}`
            : hasDiscount
              ? `Pembayaran Album: ${album.name} (diskon ${discountPercent}% sudah diterapkan)`
              : `Pembayaran Album: ${album.name}`,
          quantity: 1,
          price: amountForCompare,
        },
      ];
    }
    if (!isUpgradeRequest && hasDiscount && discountAmount > 0) {
      lineItems.push({
        name: `Diskon ${discountPercent}%`,
        quantity: 1,
        price: -discountAmount,
      })
    }

    const invoicePayload: Record<string, unknown> = {
      external_id: externalId,
      amount: amount,
      currency: 'IDR',
      description: desc,
      success_redirect_url: `${baseUrl}${redirectPath}?status=success`,
      failure_redirect_url: `${baseUrl}${redirectPath}?status=failed`,
      items: lineItems,
    }
    if (!isUpgradeRequest && hasDiscount && discountAmount > 0) {
      invoicePayload.metadata = {
        discount_percent_off: discountPercent,
        subtotal_before_discount: subtotalBeforeDiscount,
        discount_amount: discountAmount,
        total_after_discount: amountNumber,
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
    const invoice = (await xenditRes.json()) as {
      message?: string
      invoice_url?: string
      status?: string
    }

    if (!xenditRes.ok) {
      console.error('Xendit album checkout error:', invoice)
      return c.json({ error: invoice?.message || 'Failed to create invoice' }, 500)
    }

    const invoiceUrl = invoice.invoice_url
    if (!invoiceUrl) return c.json({ error: 'Xendit did not return invoice_url' }, 500)

    await db
      .prepare(
        `INSERT INTO transactions (id, user_id, external_id, album_id, amount, status, invoice_url, description, new_students_count, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, datetime('now'), datetime('now'))`
      )
      .bind(
        txId,
        user.id,
        externalId,
        albumId,
        amount,
        invoiceUrl,
        desc,
        body.new_students_count ?? null
      )
      .run()

    await db
      .prepare(`UPDATE albums SET payment_url = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(invoiceUrl, albumId)
      .run()
    return c.json({ invoiceUrl })
  } catch (error: unknown) {
    console.error('Album checkout error:', error)
    return c.json({ error: error instanceof Error ? error.message : 'Internal server error' }, 500)
  }
})

export default checkoutRoute






