// Tests d'intégration de /api/coffre/cover — auth, validation de préfixe, sélection du fichier
// média le plus récent sous le préfixe (ignore les fichiers méta).
import { describe, it, expect, vi, beforeEach } from 'vitest'

const requireAuthMock = vi.fn()
vi.mock('$lib/server/auth', () => ({
	requireAuth: (event: unknown) => requireAuthMock(event),
}))

const files = new Map<string, string>()
vi.mock('$lib/server/gcs', () => ({
	getGcsBucket: () => ({
		async getFiles({ prefix }: { prefix: string }) {
			const names = [...files.keys()].filter((k) => k.startsWith(prefix))
			return [names.map((name) => ({ name })), null, { prefixes: [] }] as const
		},
	}),
}))

import { GET } from './+server'

function fakeEvent(searchParams: Record<string, string>) {
	const url = new URL('http://test.local/api/coffre/cover?' + new URLSearchParams(searchParams).toString())
	return { url } as any
}

beforeEach(() => {
	files.clear()
	requireAuthMock.mockReset()
	requireAuthMock.mockResolvedValue({ name: 'Chetana' })
})

describe('GET /api/coffre/cover', () => {
	it('rejette un préfixe hors année/mois (racine, jour, autre feature)', async () => {
		await expect(GET(fakeEvent({ prefix: '' }))).rejects.toMatchObject({ status: 400 })
		await expect(GET(fakeEvent({ prefix: '2026/09/22/' }))).rejects.toMatchObject({ status: 400 })
		await expect(GET(fakeEvent({ prefix: 'chat/' }))).rejects.toMatchObject({ status: 400 })
	})

	it('renvoie le fichier média le plus récent sous le préfixe année', async () => {
		files.set('2026/03/12/a.jpg', '')
		files.set('2026/09/22/b.jpg', '')
		files.set('2026/09/22/note.txt', '')
		const res = await GET(fakeEvent({ prefix: '2026/' }))
		const body = await res.json()
		expect(body.cover).toBe('2026/09/22/b.jpg')
	})

	it('ignore les fichiers méta (note.txt, meta.json, reactions.json)', async () => {
		files.set('2026/09/22/meta.json', '')
		files.set('2026/09/22/reactions.json', '')
		files.set('2026/09/22/photo.jpg', '')
		const res = await GET(fakeEvent({ prefix: '2026/09/' }))
		const body = await res.json()
		expect(body.cover).toBe('2026/09/22/photo.jpg')
	})

	it('null si aucun fichier média (mois vide ou uniquement des méta)', async () => {
		files.set('2026/09/22/note.txt', '')
		const res = await GET(fakeEvent({ prefix: '2026/09/' }))
		const body = await res.json()
		expect(body.cover).toBeNull()
	})
})
