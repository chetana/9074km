import { error, json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireAuth } from '$lib/server/auth'
import { getGcsBucket } from '$lib/server/gcs'
import { geminiGenerateLesson } from '$lib/server/vertex'
import { getUnit } from '$lib/curriculum'
import type { Lesson } from '$lib/exercises'

// Cache partagé par unité + langue maternelle (le curriculum est fixe).
function lessonPath(unitId: string, l1: string) {
	return `apprendre/lessons/${unitId}-${l1}.json`
}

export const GET: RequestHandler = async (event) => {
	await requireAuth(event)
	const unitId = event.url.searchParams.get('unitId')
	const l1 = (event.url.searchParams.get('l1') === 'fr' ? 'fr' : 'kh') as 'fr' | 'kh'
	const fresh = event.url.searchParams.get('fresh') === '1'

	if (!unitId) throw error(400, 'unitId required')
	const unit = getUnit(unitId)
	if (!unit) throw error(404, 'Unknown unit')

	const bucket = getGcsBucket()
	const file = bucket.file(lessonPath(unitId, l1))

	// Cache hit (sauf régénération forcée)
	if (!fresh) {
		try {
			const [contents] = await file.download()
			return json(JSON.parse(contents.toString('utf-8')), {
				headers: { 'Cache-Control': 'no-store' },
			})
		} catch (e: any) {
			if (e?.code !== 404) throw error(502, 'Failed to read lesson cache')
		}
	}

	// Génération Gemini
	let generated: any
	try {
		generated = await geminiGenerateLesson({
			level: unit.level,
			title: unit.title_fr,
			grammar: unit.grammar,
			theme: unit.theme,
			canDo: unit.canDo_fr,
			seedVocab: unit.seedVocab,
			l1,
		})
	} catch (e: any) {
		throw error(502, `Lesson generation failed: ${e?.message ?? 'unknown'}`)
	}

	const lesson: Lesson = {
		unitId,
		intro: generated?.intro ?? '',
		exercises: Array.isArray(generated?.exercises) ? generated.exercises : [],
		generatedAt: new Date().toISOString(),
	}
	if (lesson.exercises.length === 0) throw error(502, 'Empty lesson generated')

	// Persiste le cache (best-effort)
	try {
		await file.save(JSON.stringify(lesson), { contentType: 'application/json' })
	} catch { /* ignore cache write errors */ }

	return json(lesson, { headers: { 'Cache-Control': 'no-store' } })
}
