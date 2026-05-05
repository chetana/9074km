import { error, json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireAuth } from '$lib/server/auth'
import { geminiTranscribeAndTranslate } from '$lib/server/vertex'

export const POST: RequestHandler = async (event) => {
  const { request } = event
  const user = await requireAuth(event)
  const body = await request.json() as { audio: string; mimeType: string; previousMessage?: string }
  if (!body?.audio || !body?.mimeType) throw error(400, 'audio and mimeType are required')

  const result = await geminiTranscribeAndTranslate(body.audio, body.mimeType, user.name.split(' ')[0], body.previousMessage)
  return json(result)
}
