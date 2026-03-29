import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireAuth } from '$lib/server/auth'
import { geminiTts } from '$lib/server/vertex'

export const POST: RequestHandler = async ({ request }) => {
  await requireAuth(request)
  const { text, lang } = await request.json() as { text: string; lang: 'fr' | 'kh' | 'en' }
  if (!text || !lang) throw error(400, 'text and lang required')
  // English → Zephyr (French voice), Khmer → Kore
  const ttsLang: 'fr' | 'kh' = lang === 'kh' ? 'kh' : 'fr'
  const audio = await geminiTts(text, ttsLang)
  return json({ audio })
}
