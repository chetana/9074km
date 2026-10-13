import { createHash } from 'node:crypto'
import { getGcsBucket } from './gcs'

// Cache S3 partagé des audios TTS Gemini : le même texte+voix ne coûte qu'UNE génération pour
// tous les appareils (le cache navigateur de audioCache.ts, lui, est par appareil et limité à 30).
// Incrémenter la version quand le modèle ou la voix change (geminiTts), sinon d'anciens audios
// resteraient servis.
const TTS_CACHE_VERSION = 'v1-2.5-flash-tts'

export function ttsCacheKey(text: string, lang: 'fr' | 'kh'): string {
	const norm = text.normalize('NFC').replace(/\s+/g, ' ').trim()
	const h = createHash('sha256').update(`${TTS_CACHE_VERSION}|${lang}|${norm}`).digest('hex')
	return `tts-cache/${lang}/${h}.b64`
}

/** Audio base64 en cache, ou null (absent ou S3 en erreur : le cache ne doit jamais casser le TTS). */
export async function getCachedTts(key: string): Promise<string | null> {
	try {
		const [buf] = await getGcsBucket().file(key).download()
		return buf.toString('utf8') || null
	} catch (e: any) {
		if (e?.code !== 404) console.warn(`[tts-cache] lecture KO (${e?.message})`)
		return null
	}
}

export async function putCachedTts(key: string, base64: string): Promise<void> {
	try {
		await getGcsBucket().file(key).save(base64, { contentType: 'text/plain' })
	} catch (e: any) {
		console.warn(`[tts-cache] écriture KO (${e?.message})`)
	}
}
