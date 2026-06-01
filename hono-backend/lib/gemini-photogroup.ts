/**
 * Photo Group: gabung beberapa foto orang jadi satu foto grup via Gemini 2.5 Flash Image (Replicate).
 * Fokus: konsistensi wajah per referensi, pakaian tetap kecuali user minta di prompt/catatan.
 */

import Replicate from 'replicate'
import {
  REPLICATE_GEMINI_FLASH_IMAGE,
  runWith429Retry,
  type GeminiImageInput,
} from './gemini-tryon'
import { getSingleReplicateUrl } from './replicate-output'

type ReplicateClient = InstanceType<typeof Replicate>

function toDataUri(input: GeminiImageInput): string {
  return `data:${input.mimeType};base64,${input.base64}`
}

function extractImageUrl(output: unknown): string {
  if (
    typeof output === 'string' &&
    (output.startsWith('http://') || output.startsWith('https://') || output.startsWith('data:'))
  ) {
    return output
  }
  return getSingleReplicateUrl(output)
}

function buildPhotoGroupPrompt(
  userPrompt: string,
  imageCount: number,
  extraNotes?: string
): string {
  const lines: string[] = []
  lines.push(
    `Create ONE photorealistic group photograph combining exactly ${imageCount} different people from the ${imageCount} reference images.`
  )
  lines.push('')
  lines.push(
    'REFERENCE ORDER (first uploaded image = #1, second = #2, and so on — never swap identities):'
  )
  for (let i = 1; i <= imageCount; i++) {
    lines.push(
      `- Image #${i}: Person ${i}. Match this person’s face, hair, skin tone, facial structure, and body proportions ONLY from this reference.`
    )
  }
  lines.push('')
  lines.push('IDENTITY (critical):')
  lines.push(
    '- Each person in the output must be clearly the same individual as in their numbered reference. Do not blend faces, do not swap faces, do not invent new people.'
  )
  lines.push(
    '- Preserve recognizable features per person: eyes, nose, mouth, jawline, hair, approximate age.'
  )
  lines.push('')
  lines.push('CLOTHING AND ACCESSORIES:')
  lines.push(
    '- Keep each person’s outfit, colors, patterns, logos, and accessories exactly as in their reference image, UNLESS the user explicitly requests a clothing or styling change for a specific person (e.g. "change outfit for person 3", "ganti baju foto ke-2").'
  )
  lines.push('')
  lines.push('SCENE, BACKGROUND, ARRANGEMENT, POSES (follow the user):')
  lines.push(userPrompt.trim())
  if (extraNotes?.trim()) {
    lines.push('')
    lines.push('ADDITIONAL INSTRUCTIONS (per image number / special requests):')
    lines.push(extraNotes.trim())
  }
  lines.push('')
  lines.push(
    'OUTPUT: One extremely sharp, high-quality PNG/image in 4k/8k resolution, highly detailed, with natural consistent lighting across the group. Avoid any blur or soft focus.'
  )
  return lines.join('\n')
}

export async function generatePhotoGroupGemini(
  replicate: ReplicateClient,
  subjects: GeminiImageInput[],
  userPrompt: string,
  extraNotes?: string
): Promise<string> {
  if (subjects.length < 2) {
    throw new Error('Photo group requires at least 2 reference images.')
  }
  const prompt = buildPhotoGroupPrompt(userPrompt, subjects.length, extraNotes)

  const output = await runWith429Retry(
    () =>
      replicate.run(REPLICATE_GEMINI_FLASH_IMAGE, {
        input: {
          prompt,
          image_input: subjects.map(toDataUri),
          output_format: 'png',
          aspect_ratio: 'match_input_image',
        },
      }),
    5
  )

  const url = extractImageUrl(output)
  if (!url) {
    throw new Error(
      'Replicate: model did not return an image URL. Try fewer photos, clearer faces, or a simpler scene description.'
    )
  }
  return url
}






