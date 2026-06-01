import { Hono } from 'hono'
import type { Context } from 'hono'
import { getD1 } from '../../lib/edge-env'
import { fileToDataUri, formDataString, requestIsMultipart } from '../../lib/ai-multipart'
import { deductCreditsFromD1 } from '../../lib/credits'
import { generateVirtualTryOnGemini, imageStringToGeminiInput, resolveAspectRatioForPerson } from '../../lib/gemini-tryon'
import { respondWithReplicateFriendlyError } from '../../lib/replicate-error-response'
import Replicate from 'replicate'
import { AppEnv, requireAuthJwt } from '../../middleware'

type ReplicateEnv = {
  REPLICATE_API_TOKEN?: string
}

type TryOnBody = {
  human_img?: string
  garm_img?: string
  garment_des?: string
  category?: string
  steps?: number
  crop?: boolean
  seed?: number
  force_dc?: boolean
  mask_only?: boolean
  garments?: string[]
  mode?: string
} & Record<string, unknown>

async function parseTryOnBody(c: Context): Promise<TryOnBody> {
  if (!requestIsMultipart(c)) {
    const raw = await c.req.json().catch(() => ({}))
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as TryOnBody) : {}
  }
  const fd = await c.req.formData()
  const human: unknown = fd.get('human_img')
  let human_img = ''
  if (human instanceof File && human.size > 0) {
    human_img = await fileToDataUri(human)
  }
  const garm: unknown = fd.get('garm_img')
  let garm_img: string | undefined
  if (garm instanceof File && garm.size > 0) {
    garm_img = await fileToDataUri(garm)
  }
  const rawGarments = fd.getAll('garments') as unknown[]
  const garmentFiles = rawGarments.filter((x): x is File => x instanceof File && x.size > 0)
  const garments = await Promise.all(garmentFiles.map((f) => fileToDataUri(f)))
  const mode = fd.get('mode')
  const out: TryOnBody = {
    human_img,
    garment_des: formDataString(fd, 'garment_des') || '',
    category: formDataString(fd, 'category') || 'upper_body',
    mode: typeof mode === 'string' ? mode : undefined,
  }
  if (garm_img) out.garm_img = garm_img
  if (garments.length) out.garments = garments
  for (let i = 0; i < 4; i++) {
    const val = formDataString(fd, `category_${i}`)
    if (val) out[`category_${i}`] = val
  }
  return out
}

const tryon = new Hono<AppEnv>()
tryon.use('*', requireAuthJwt)

const MAX_GARMENTS = 3

// POST /api/ai-features/tryon
tryon.post('/', async (c) => {
  try {
    const db = getD1(c)
    if (!db) return c.json({ ok: false, error: 'Database not configured' }, 503)
    const user = c.get('user')
    if (!user?.id) return c.json({ ok: false, error: 'Unauthorized' }, 401)

    const REPLICATE_API_TOKEN = ((c.env as ReplicateEnv).REPLICATE_API_TOKEN || '').trim()
    if (!REPLICATE_API_TOKEN)
      return c.json({ ok: false, error: 'REPLICATE_API_TOKEN tidak dikonfigurasi' }, 500)

    const replicate = new Replicate({ auth: REPLICATE_API_TOKEN })

    const body = await parseTryOnBody(c)

    if (!body.human_img) return c.json({ ok: false, error: 'File manusia tidak valid' }, 400)

    let itemsCount = 1
    const garments = Array.isArray(body.garments)
      ? body.garments.filter((g): g is string => typeof g === 'string')
      : []

    if (!body.garm_img) {
      if (!garments.length) return c.json({ ok: false, error: 'Minimal 1 garment' }, 400)
      if (garments.length > MAX_GARMENTS) {
        return c.json({ ok: false, error: `Maksimal ${MAX_GARMENTS} garments` }, 400)
      }
      itemsCount = garments.length
    }

    const pricing = await db
      .prepare(`SELECT credits_per_use FROM ai_feature_pricing WHERE feature_slug = ?`)
      .bind('tryon')
      .first<{ credits_per_use: number }>()

    const creditsPerUse = pricing?.credits_per_use ?? 0
    const totalCreditsNeeded = creditsPerUse * itemsCount

    if (totalCreditsNeeded > 0) {
      const r = await deductCreditsFromD1({
        db,
        userId: user.id,
        amount: totalCreditsNeeded,
      })
      if (!r.ok) return c.json({ ok: false, error: 'Credit tidak cukup' }, 402)
    }

    const person0 = await imageStringToGeminiInput(body.human_img)
    if (!person0) return c.json({ ok: false, error: 'Gambar orang tidak valid' }, 400)

    // Kunci aspect ratio dari foto asli agar full-body (mis. sepatu) tidak terpotong saat generate / chain.
    const personAspectRatio = resolveAspectRatioForPerson(person0)

    if (body.garm_img) {
      const cloth = await imageStringToGeminiInput(body.garm_img)
      if (!cloth) return c.json({ ok: false, error: 'Gambar garment tidak valid' }, 400)
      const result = await generateVirtualTryOnGemini(replicate, person0, cloth, {
        aspectRatio: personAspectRatio,
      })
      return c.json({ ok: true, results: [result] })
    }

    if (body.mode === 'chain') {
      let curPerson = person0
      let finalResult = ''
      for (let i = 0; i < garments.length; i++) {
        const cloth = await imageStringToGeminiInput(garments[i])
        if (!cloth) return c.json({ ok: false, error: `Gambar garment ${i + 1} tidak valid` }, 400)
        finalResult = await generateVirtualTryOnGemini(replicate, curPerson, cloth, {
          aspectRatio: personAspectRatio,
        })
        if (i < garments.length - 1) {
          const next = await imageStringToGeminiInput(finalResult)
          if (!next) return c.json({ ok: false, error: 'Gagal memproses hasil intermediate' }, 500)
          curPerson = next
        }
      }
      return c.json({ ok: true, results: [finalResult] })
    }

    const results = await Promise.all(
      garments.map(async (g, i) => {
        const cloth = await imageStringToGeminiInput(g)
        if (!cloth) throw new Error(`Gambar garment ${i + 1} tidak valid`)
        return generateVirtualTryOnGemini(replicate, person0, cloth, {
          aspectRatio: personAspectRatio,
        })
      })
    )
    return c.json({ ok: true, results })
  } catch (err: unknown) {
    return respondWithReplicateFriendlyError(c, err, 'Try-on error')
  }
})

export default tryon






