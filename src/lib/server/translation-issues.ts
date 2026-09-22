// Journal des traductions khmères suspectes (script étranger / latin corrompu détecté
// automatiquement), pour alimenter le lexique du prompt sans jamais le modifier tout seul.
// Un fichier par incident (pas de append S3) sous translation-issues/YYYY/MM/DD/<ts>-<rand>.json.
// Relu périodiquement via un skill dédié qui propose des ajouts au lexique (GLM_ADAPT / vertex.ts)
// — validés par Chetana avant merge, jamais appliqués automatiquement.
import { getGcsBucket } from './gcs'

export interface TranslationIssue {
	reason: 'foreign_script' | 'glued_latin'
	sourceText: string
	author?: string
	badKh: string
	fixedKh: string
	engine: 'glm' | 'gemini'
}

export async function logTranslationIssue(issue: TranslationIssue): Promise<void> {
	try {
		const now = new Date()
		const y = String(now.getFullYear())
		const m = String(now.getMonth() + 1).padStart(2, '0')
		const d = String(now.getDate()).padStart(2, '0')
		const key = `translation-issues/${y}/${m}/${d}/${now.getTime()}-${Math.random().toString(36).slice(2, 8)}.json`
		const bucket = getGcsBucket()
		await bucket.file(key).save(JSON.stringify({ ts: now.toISOString(), ...issue }, null, 2), { contentType: 'application/json' })
	} catch (e) {
		// Best-effort : un échec de log ne doit jamais casser la traduction elle-même.
		console.warn(`[translation-issues] échec de journalisation (${(e as Error).message})`)
	}
}
