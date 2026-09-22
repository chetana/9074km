// Tests d'intégration de la route apprendre/lesson — dépendances (auth, S3, curriculum, Gemini)
// mockées. Vérifie la logique de cache (coût : ne pas régénérer une leçon déjà en cache) et les
// garde-fous de forme (leçon vide = erreur, jamais un cache invalide silencieusement accepté).
import { describe, it, expect, vi, beforeEach } from 'vitest'

const requireAuthMock = vi.fn()
vi.mock('$lib/server/auth', () => ({
	requireAuth: (event: unknown) => requireAuthMock(event),
}))

const files = new Map<string, string>()
const gcsFile = (name: string) => ({
	async download() {
		if (!files.has(name)) { const e: any = new Error('not found'); e.code = 404; throw e }
		return [Buffer.from(files.get(name)!)]
	},
	async save(data: string) { files.set(name, data) },
})
vi.mock('$lib/server/gcs', () => ({
	getGcsBucket: () => ({ file: gcsFile }),
}))

const geminiGenerateLessonMock = vi.fn()
vi.mock('$lib/server/vertex', () => ({
	geminiGenerateLesson: (...args: unknown[]) => geminiGenerateLessonMock(...args),
}))

vi.mock('$lib/curriculum', () => ({
	getUnit: (unitId: string) =>
		unitId === 'unit1'
			? { level: 'A1', title_fr: 'Unité 1', grammar: '', theme: '', canDo_fr: '', seedVocab: [] }
			: null,
}))

import { GET } from './+server'

function fakeEvent(searchParams: Record<string, string>) {
	const url = new URL('http://test.local/api/apprendre/lesson?' + new URLSearchParams(searchParams).toString())
	return { url } as any
}

beforeEach(() => {
	files.clear()
	requireAuthMock.mockReset()
	requireAuthMock.mockResolvedValue({ name: 'Chetana' })
	geminiGenerateLessonMock.mockReset()
})

describe('GET /api/apprendre/lesson — cache', () => {
	it('cache-hit : ne rappelle PAS Gemini (économie)', async () => {
		files.set('apprendre/lessons/unit1-fr.json', JSON.stringify({
			unitId: 'unit1', intro: 'Bonjour', exercises: [{ q: '1' }], generatedAt: '2026-01-01T00:00:00Z',
		}))
		const res = await GET(fakeEvent({ unitId: 'unit1', l1: 'fr' }))
		expect(res.status).toBe(200)
		expect(geminiGenerateLessonMock).not.toHaveBeenCalled()
		const body = await res.json()
		expect(body.intro).toBe('Bonjour')
	})

	it('fresh=1 : contourne le cache même s\'il existe et régénère', async () => {
		files.set('apprendre/lessons/unit1-fr.json', JSON.stringify({
			unitId: 'unit1', intro: 'Ancienne', exercises: [{ q: '1' }], generatedAt: '2026-01-01T00:00:00Z',
		}))
		geminiGenerateLessonMock.mockResolvedValue({ intro: 'Nouvelle', exercises: [{ q: '2' }] })

		const res = await GET(fakeEvent({ unitId: 'unit1', l1: 'fr', fresh: '1' }))

		expect(geminiGenerateLessonMock).toHaveBeenCalledTimes(1)
		const body = await res.json()
		expect(body.intro).toBe('Nouvelle')
	})

	it('pas de cache : génère puis persiste', async () => {
		geminiGenerateLessonMock.mockResolvedValue({ intro: 'Salut', exercises: [{ q: '1' }] })
		const res = await GET(fakeEvent({ unitId: 'unit1', l1: 'fr' }))
		expect(res.status).toBe(200)
		expect(geminiGenerateLessonMock).toHaveBeenCalledTimes(1)
		expect(files.has('apprendre/lessons/unit1-fr.json')).toBe(true)
	})
})

describe('GET /api/apprendre/lesson — erreurs', () => {
	it('unitId manquant : 400', async () => {
		await expect(GET(fakeEvent({}))).rejects.toMatchObject({ status: 400 })
	})

	it('unité inconnue : 404', async () => {
		await expect(GET(fakeEvent({ unitId: 'inconnu' }))).rejects.toMatchObject({ status: 404 })
	})

	it('génération avec exercises vide : 502 (jamais une leçon inutilisable renvoyée en 200)', async () => {
		geminiGenerateLessonMock.mockResolvedValue({ intro: 'Salut', exercises: [] })
		await expect(GET(fakeEvent({ unitId: 'unit1', l1: 'fr' }))).rejects.toMatchObject({ status: 502 })
		expect(files.has('apprendre/lessons/unit1-fr.json')).toBe(false)
	})

	it('échec Gemini : 502, rien n\'est persisté', async () => {
		geminiGenerateLessonMock.mockRejectedValue(new Error('Vertex indisponible'))
		await expect(GET(fakeEvent({ unitId: 'unit1', l1: 'fr' }))).rejects.toMatchObject({ status: 502 })
		expect(files.has('apprendre/lessons/unit1-fr.json')).toBe(false)
	})
})
