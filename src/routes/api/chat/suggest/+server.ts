import { error, json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireAuth } from '$lib/server/auth'
import { geminiSuggest } from '$lib/server/vertex'

export const POST: RequestHandler = async (event) => {
  const { request } = event
  const user = await requireAuth(event)
  const body = await request.json() as { text: string; previousMessage?: string }
  if (!body?.text) throw error(400, 'text is required')
  if (body.text.trim().length < 2) throw error(400, 'text too short')

  const firstName = user.name.split(' ')[0]
  const normalized = firstName.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const authorLang: 'fr' | 'kh' = /^(chet|chetana)$/i.test(normalized) ? 'fr' : 'kh'

  try {
    const suggestion = await geminiSuggest(body.text, authorLang, body.previousMessage)
    return json(suggestion)
  } catch {
    throw error(502, 'Gemini suggestion failed')
  }
}
