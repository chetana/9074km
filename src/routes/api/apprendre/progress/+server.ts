import { error, json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireAuth } from '$lib/server/auth'
import { getGcsBucket } from '$lib/server/gcs'
import { CURRICULUM } from '$lib/curriculum'

export interface ApprendreProgress {
	name: string
	email?: string
	completed: string[]              // ids des unités terminées
	stars: Record<string, number>    // id unité -> étoiles 0..3 (meilleur score)
	xp: number
	updatedAt?: string
}

function progressPath(name: string) {
	return `apprendre/progress-${name.toLowerCase()}.json`
}

const VALID_IDS = new Set(CURRICULUM.map(u => u.id))

export const GET: RequestHandler = async (event) => {
	const user = await requireAuth(event)
	const name = user.name?.split(' ')[0] ?? 'unknown'
	const bucket = getGcsBucket()
	const headers = { 'Cache-Control': 'no-store, must-revalidate' }
	try {
		const [contents] = await bucket.file(progressPath(name)).download()
		return json(JSON.parse(contents.toString('utf-8')), { headers })
	} catch (e: any) {
		if (e?.code === 404) {
			return json({ name, completed: [], stars: {}, xp: 0 } satisfies ApprendreProgress, { headers })
		}
		throw error(502, 'Failed to read progress')
	}
}

// Marque une unité terminée (avec étoiles + XP gagnée). Idempotent sur `completed`.
export const POST: RequestHandler = async (event) => {
	const user = await requireAuth(event)
	const name = user.name?.split(' ')[0] ?? 'unknown'
	const body = await event.request.json() as { unitId: string; stars?: number; xp_gained?: number }

	if (!body?.unitId || !VALID_IDS.has(body.unitId)) throw error(400, 'Invalid unitId')
	const stars = Math.max(0, Math.min(3, body.stars ?? 0))
	const xpGained = Math.max(0, body.xp_gained ?? 0)

	const bucket = getGcsBucket()
	let progress: ApprendreProgress = { name, email: user.email, completed: [], stars: {}, xp: 0 }
	try {
		const [contents] = await bucket.file(progressPath(name)).download()
		progress = JSON.parse(contents.toString('utf-8'))
	} catch (e: any) {
		if (e?.code !== 404) throw error(502, 'Failed to read progress')
	}

	progress.email = user.email
	if (!progress.completed.includes(body.unitId)) progress.completed.push(body.unitId)
	progress.stars ??= {}
	progress.stars[body.unitId] = Math.max(progress.stars[body.unitId] ?? 0, stars)
	progress.xp = (progress.xp ?? 0) + xpGained
	progress.updatedAt = new Date().toISOString()

	await bucket.file(progressPath(name)).save(JSON.stringify(progress), { contentType: 'application/json' })
	return json(progress)
}
