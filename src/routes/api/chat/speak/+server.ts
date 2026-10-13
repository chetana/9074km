import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireAuth } from '$lib/server/auth'
import { geminiTts } from '$lib/server/vertex'
import { ttsCacheKey, getCachedTts, putCachedTts } from '$lib/server/tts-cache'

export const POST: RequestHandler = async (event) => {
  const { request } = event
  await requireAuth(event)
  const { text, lang } = await request.json() as { text: string; lang: 'fr' | 'kh' | 'en' }
  if (!text || !lang) throw error(400, 'text and lang required')
  // English → Zephyr (French voice), Khmer → Kore
  const ttsLang: 'fr' | 'kh' = lang === 'kh' ? 'kh' : 'fr'
  // Cache S3 partagé : même texte+voix = une seule génération Gemini pour tous les appareils.
  const key = ttsCacheKey(text, ttsLang)
  const hit = await getCachedTts(key)
  if (hit) return json({ audio: hit })
  const audio = await geminiTts(text, ttsLang)
  void putCachedTts(key, audio)
  return json({ audio })
}
