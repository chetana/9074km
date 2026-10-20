import { describe, it, expect, vi, beforeEach } from 'vitest'

const requireAuthMock = vi.fn()
vi.mock('$lib/server/auth', () => ({ requireAuth: (e: unknown) => requireAuthMock(e) }))
vi.mock('$lib/server/coffre-db', () => ({ ensureCoffreSchema: vi.fn(async () => {}) }))
const skipMock = vi.fn()
vi.mock('$lib/server/media-store', () => ({ skipMedia: (...a: unknown[]) => skipMock(...a) }))

import { POST } from './+server'

const ev = (body: unknown) => ({ request: { json: async () => body } }) as any

beforeEach(() => {
	skipMock.mockReset().mockResolvedValue(2)
	requireAuthMock.mockReset().mockResolvedValue({ id: 1 })
})

describe('POST /api/coffre/media/skip', () => {
	it('401 sans session', async () => {
		requireAuthMock.mockRejectedValue({ status: 401 })
		await expect(POST(ev({ paths: ['2026/10/02/a.jpg'] }))).rejects.toMatchObject({ status: 401 })
		expect(skipMock).not.toHaveBeenCalled()
	})
	it('pose skipped_at sur les chemins (dédoublonnés) ; undo transmis', async () => {
		const r = await POST(ev({ paths: ['2026/10/02/a.jpg', '2026/10/02/a.jpg', '2026/10/02/b.jpg'] }))
		expect(await r.json()).toEqual({ success: true, updated: 2 })
		expect(skipMock).toHaveBeenCalledWith(['2026/10/02/a.jpg', '2026/10/02/b.jpg'], false)
		await POST(ev({ paths: ['2026/10/02/a.jpg'], undo: true }))
		expect(skipMock).toHaveBeenLastCalledWith(['2026/10/02/a.jpg'], true)
	})
	it('400 : vide, > 500, chemin hors coffre, méta, undo non booléen, clé inconnue', async () => {
		const many = Array.from({ length: 501 }, (_, i) => `2026/10/02/p${i}.jpg`)
		for (const body of [{ paths: [] }, { paths: many }, { paths: ['chat/2026/09/22.json'] }, { paths: ['2026/10/02/meta.json'] }, { paths: ['2026/10/02/a.jpg'], undo: 'yes' }, { paths: ['2026/10/02/a.jpg'], x: 1 }, null]) {
			await expect(POST(ev(body)), JSON.stringify(body)?.slice(0, 40)).rejects.toMatchObject({ status: 400 })
		}
		expect(skipMock).not.toHaveBeenCalled()
	})
	it('500 chemins acceptés', async () => {
		await POST(ev({ paths: Array.from({ length: 500 }, (_, i) => `2026/10/02/p${i}.jpg`) }))
		expect(skipMock).toHaveBeenCalledTimes(1)
	})
	it('Postgres KO : 503', async () => {
		const err = vi.spyOn(console, 'error').mockImplementation(() => {})
		skipMock.mockRejectedValue(new Error('pg'))
		await expect(POST(ev({ paths: ['2026/10/02/a.jpg'] }))).rejects.toMatchObject({ status: 503 })
		err.mockRestore()
	})
})
