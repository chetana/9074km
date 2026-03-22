import { error, json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireAuth } from '$lib/server/auth'
import { geminiTranscribeAndTranslate } from '$lib/server/vertex'

export const POST: RequestHandler = async ({ request }) => {
  const user = await requireAuth(request)
  const body = await request.json() as { audio: string; mimeType: string }
  if (!body?.audio || !body?.mimeType) throw error(400, 'audio and mimeType are required')

  const result = await geminiTranscribeAndTranslate(body.audio, body.mimeType, user.name.split(' ')[0])
  return json(result)
}
