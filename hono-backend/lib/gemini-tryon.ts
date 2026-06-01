/**
 * Virtual try-on memakai model Gemini yang di-host di Replicate (satu billing Replicate):
 * - https://replicate.com/google/gemini-2.5-flash — deskripsi pakaian (teks)
 * - https://replicate.com/google/gemini-2.5-flash-image — gabungan gambar + prompt
 *
 * Alur prompt mengikuti https://github.com/iliasprc/virtual-try-on (services/geminiService.ts).
 */

import Replicate from 'replicate'
import { arrayBufferToBase64 } from './ai-multipart'
import { getSingleReplicateUrl } from './replicate-output'

/** Model ID di Replicate (tanpa hash = versi default terbaru). */
export const REPLICATE_GEMINI_FLASH = 'google/gemini-2.5-flash'
export const REPLICATE_GEMINI_FLASH_IMAGE = 'google/gemini-2.5-flash-image'

export type GeminiImageInput = {
  base64: string
  mimeType: string
}

/** Aspect ratios supported by google/gemini-2.5-flash-image on Replicate. */
export type GeminiFlashAspectRatio =
  | 'match_input_image'
  | '1:1'
  | '3:2'
  | '2:3'
  | '3:4'
  | '4:3'
  | '4:5'
  | '5:4'
  | '9:16'
  | '16:9'
  | '21:9'

const GEMINI_FLASH_ASPECT_RATIOS: { label: GeminiFlashAspectRatio; value: number }[] = [
  { label: '1:1', value: 1 },
  { label: '3:2', value: 3 / 2 },
  { label: '2:3', value: 2 / 3 },
  { label: '3:4', value: 3 / 4 },
  { label: '4:3', value: 4 / 3 },
  { label: '4:5', value: 4 / 5 },
  { label: '5:4', value: 5 / 4 },
  { label: '9:16', value: 9 / 16 },
  { label: '16:9', value: 16 / 9 },
  { label: '21:9', value: 21 / 9 },
]

function base64ToBytes(base64: string): Uint8Array {
  const raw = atob(base64.replace(/\s/g, ''))
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

function readPngDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24) return null
  if (bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) return null
  const width = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19]
  const height = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23]
  if (!width || !height) return null
  return { width, height }
}

function readJpegDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  let i = 2
  while (i < bytes.length - 8) {
    if (bytes[i] !== 0xff) {
      i++
      continue
    }
    const marker = bytes[i + 1]
    if (marker === 0xc0 || marker === 0xc2) {
      const height = (bytes[i + 5] << 8) | bytes[i + 6]
      const width = (bytes[i + 7] << 8) | bytes[i + 8]
      if (!width || !height) return null
      return { width, height }
    }
    const len = (bytes[i + 2] << 8) | bytes[i + 3]
    if (len < 2) break
    i += 2 + len
  }
  return null
}

/** Read width/height from JPEG/PNG base64 (best effort, no deps). */
export function getImageDimensionsFromGeminiInput(
  input: GeminiImageInput
): { width: number; height: number } | null {
  try {
    const bytes = base64ToBytes(input.base64)
    const mime = input.mimeType.toLowerCase()
    if (mime.includes('png')) return readPngDimensions(bytes)
    if (mime.includes('jpeg') || mime.includes('jpg')) return readJpegDimensions(bytes)
    return readJpegDimensions(bytes) ?? readPngDimensions(bytes)
  } catch {
    return null
  }
}

/** Pick closest supported Gemini Flash aspect ratio from pixel dimensions. */
export function resolveClosestAspectRatio(
  width: number,
  height: number
): GeminiFlashAspectRatio {
  if (!width || !height) return 'match_input_image'
  const ratio = width / height
  let best: GeminiFlashAspectRatio = 'match_input_image'
  let bestDiff = Number.POSITIVE_INFINITY
  for (const item of GEMINI_FLASH_ASPECT_RATIOS) {
    const diff = Math.abs(Math.log(ratio / item.value))
    if (diff < bestDiff) {
      bestDiff = diff
      best = item.label
    }
  }
  return best
}

export function resolveAspectRatioForPerson(
  person: GeminiImageInput
): GeminiFlashAspectRatio {
  const dims = getImageDimensionsFromGeminiInput(person)
  if (!dims) return 'match_input_image'
  return resolveClosestAspectRatio(dims.width, dims.height)
}

function parseDataUri(dataUri: string): GeminiImageInput | null {
  const m = /^data:([^;]+);base64,(\S+)$/i.exec(dataUri.trim())
  if (!m) return null
  return { mimeType: m[1], base64: m[2].replace(/\s/g, '') }
}

function toDataUri(input: GeminiImageInput): string {
  return `data:${input.mimeType};base64,${input.base64}`
}

/** Siapkan gambar: data URI, URL http(s), atau base64 mentah. */
export async function imageStringToGeminiInput(s: string): Promise<GeminiImageInput | null> {
  const trimmed = s.trim()
  if (trimmed.startsWith('data:')) {
    return parseDataUri(trimmed)
  }
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    const res = await fetch(trimmed)
    if (!res.ok) return null
    const buf = await res.arrayBuffer()
    const mime = res.headers.get('content-type')?.split(';')[0]?.trim() || 'image/jpeg'
    return { base64: arrayBufferToBase64(buf), mimeType: mime }
  }
  if (/^[a-z0-9+/=\s]+$/i.test(trimmed) && trimmed.length > 64) {
    return { base64: trimmed.replace(/\s/g, ''), mimeType: 'image/jpeg' }
  }
  return null
}

function extractImageUrlFromFlashImageOutput(output: unknown): string {
  if (typeof output === 'string') {
    if (
      output.startsWith('http://') ||
      output.startsWith('https://') ||
      output.startsWith('data:')
    ) {
      return output
    }
  }
  return getSingleReplicateUrl(output)
}

type ReplicateClient = InstanceType<typeof Replicate>

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function extractRetryAfterSeconds(err: unknown): number | null {
  const e = err as {
    response?: { status?: number; headers?: { get?: (k: string) => string | null } }
    status?: number
    message?: string
  }
  const status = e?.response?.status ?? e?.status
  if (status !== 429) return null
  const h = e?.response?.headers?.get?.('retry-after')
  const fromHeader = h ? parseInt(h, 10) : NaN
  if (!Number.isNaN(fromHeader) && fromHeader > 0) return fromHeader
  if (typeof e?.message === 'string') {
    const m = /"retry_after"\s*:\s*(\d+)/.exec(e.message)
    if (m) {
      const n = parseInt(m[1], 10)
      if (!Number.isNaN(n) && n > 0) return n
    }
  }
  return null
}

export async function runWith429Retry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  let attempt = 0
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await fn()
    } catch (err) {
      const retryAfter = extractRetryAfterSeconds(err)
      if (retryAfter == null || attempt >= maxRetries) throw err
      attempt++
      await sleep((retryAfter + 1) * 1000)
    }
  }
}

/**
 * Satu pasang person + clothing → URL gambar hasil (Replicate) atau data URL jika model mengembalikan itu.
 */
export async function generateVirtualTryOnGemini(
  replicate: ReplicateClient,
  person: GeminiImageInput,
  clothing: GeminiImageInput,
  options?: { aspectRatio?: GeminiFlashAspectRatio }
): Promise<string> {
  const aspectRatio = options?.aspectRatio ?? resolveAspectRatioForPerson(person)
  const prompt = `Create a high-fidelity, photorealistic, and extremely sharp virtual try-on image in 4k/8k resolution.
Take the person from the first image and dress them in the clothing from the second image.

**Crucial Instructions:**
1. **Preserve Person's Identity:** The person's original features—including their face, hair, body shape, skin tone, and pose—must remain completely unchanged and preserved with high fidelity and sharp focus.
2. **Realistic Fit:** The clothing from the second image should be realistically draped and fitted onto the person, matching the lighting, shadows, and overall style of the original photo of the person.
3. **Keep Background:** Do not alter the background of the person's image. The final output should be just the person with the new clothing seamlessly integrated.
4. **Preserve Full Framing:** Match the first (person) image exactly — same aspect ratio, zoom level, and composition. Do not crop, reframe, or zoom in. If the full body including feet and shoes is visible in the original, the entire body including feet and shoes must remain fully visible in the output.
5. **Quality:** The result MUST BE crisp, highly detailed, and not blurry. Avoid any soft focus or blurring.`

  const output = await runWith429Retry(() =>
    replicate.run(REPLICATE_GEMINI_FLASH_IMAGE, {
      input: {
        prompt,
        image_input: [toDataUri(person), toDataUri(clothing)],
        output_format: 'png',
        aspect_ratio: aspectRatio,
      },
    })
  )

  const url = extractImageUrlFromFlashImageOutput(output)
  if (!url) {
    throw new Error('The AI did not return an image. Please try again with different images.')
  }
  return url
}






