import { error, json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireAuth } from '$lib/server/auth'
import { geminiGradeTranslation } from '$lib/server/vertex'

export const POST: RequestHandler = async (event) => {
	await requireAuth(event)
	const body = await event.request.json() as {
		prompt: string; expected: string; answer: string; l1?: 'fr' | 'kh'
	}
	if (!body?.prompt || !body?.expected || typeof body.answer !== 'string') {
		throw error(400, 'prompt, expected and answer required')
	}
	const l1 = body.l1 === 'fr' ? 'fr' : 'kh'

	try {
		const result = await geminiGradeTranslation(body.prompt, body.expected, body.answer.trim(), l1)
		return json(result)
	} catch (e: any) {
		throw error(502, `Grading failed: ${e?.message ?? 'unknown'}`)
	}
}
