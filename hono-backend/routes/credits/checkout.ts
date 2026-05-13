import { Hono } from 'hono'
import { getRole } from '../../lib/auth'
import { getD1 } from '../../lib/edge-env'
import { getAuthUserFromContext } from '../../lib/auth-user'
import { getPublicAppUrl } from '../../lib/public-url'
import { AppEnv, requireAuthJwt } from '../../middleware'

const creditsCheckout = new Hono<AppEnv>()
creditsCheckout.use('*', requireAuthJwt)

creditsCheckout.post('/', async (c) => {
  const db = getD1(c)
  if (!db) return c.json({ error: 'Database not configured' }, 503)
  try {
    const body = await c.req.json().catch(() => ({}))
    const { packageId } = body
    if (!packageId) return c.json({ error: 'Package ID required' }, 400)

    const user = getAuthUserFromContext(c)
    if (!user) return c.json({ error: 'Unauthorized' }, 401)
    const userId = user.id

    const pkg = await db
      .prepare(`SELECT * FROM credit_packages WHERE id = ?`)
      .bind(packageId)
      .first<Record<string, unknown>>()

    if (!pkg) return c.json({ error: 'Package not found' }, 404)

    const isAdmin = (await getRole(c, user)) === 'admin'
    const redirectPath = isAdmin ? '/admin/riwayat' : '/user/riwayat'

    const xenditKey = (c.env as { XENDIT_SECRET_KEY?: string }).XENDIT_SECRET_KEY || ''
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

    const externalId = `pkg_${pkg.id}_user_${userId}_ts_${Date.now()}`
    const invoicePayload: Record<string, unknown> = {
      external_id: externalId,
      amount: pkg.price,
      currency: 'IDR',
      description: `Top up ${pkg.credits} credits`,
      success_redirect_url: `${baseUrl}${redirectPath}?status=success`,
      failure_redirect_url: `${baseUrl}${redirectPath}?status=failed`,
      items: [
        {
          name: `${pkg.credits} Credits Package`,
          quantity: 1,
          price: pkg.price,
        },
      ],
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
      console.error('Xendit error:', invoice)
      return c.json({ error: invoice?.message || 'Failed to create invoice' }, 500)
    }

    try {
      const id = crypto.randomUUID()
      await db
        .prepare(
          `INSERT INTO transactions (id, user_id, external_id, package_id, amount, status, invoice_url, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
        )
        .bind(
          id,
          userId,
          externalId,
          packageId,
          pkg.price as number,
          invoice.status || 'PENDING',
          invoice.invoice_url ?? null
        )
        .run()
    } catch (dbErr: unknown) {
      console.error(
        'Failed to insert transaction to DB:',
        dbErr instanceof Error ? dbErr.message : dbErr
      )
    }

    return c.json({ invoiceUrl: invoice.invoice_url })
  } catch (error: unknown) {
    console.error('Invoice creation error:', error)
    return c.json({ error: error instanceof Error ? error.message : 'Internal server error' }, 500)
  }
})

export default creditsCheckout






