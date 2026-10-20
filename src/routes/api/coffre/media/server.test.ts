import { describe, it, expect, vi, beforeEach } from 'vitest'

const requireAuthMock = vi.fn()
vi.mock('$lib/server/auth', () => ({ requireAuth: (e: unknown) => requireAuthMock(e) }))
const ensureMock = vi.fn()
vi.mock('$lib/server/coffre-db', () => ({ ensureCoffreSchema: () => ensureMock() }))
const recordMock = vi.fn()
vi.mock('$lib/server/media-store', () => ({ recordMedia: (...a: unknown[]) => recordMock(...a) }))

import { POST } from './+server'

const ev = (body: unknown) => ({ request: { json: async () => body } }) as any
const good = { items: [{ path: '2026/11/02/a.jpg', size: 10, takenAt: '2026-11-02T07:15:30', takenOffset: '+07:00', lat: 11.5, lng: 104.9, make: 'Apple', model: 'iPhone' }] }

beforeEach(() => {
	for (const m of [requireAuthMock, ensureMock, recordMock]) m.mockReset()
	requireAuthMock.mockResolvedValue({ id: 1, name: 'Chet' })
	ensureMock.mockResolvedValue(undefined)
	recordMock.mockResolvedValue(1)
})

describe('POST /api/coffre/media', () => {
	it('401 sans session, rien n\'est écrit', async () => {
		requireAuthMock.mockRejectedValue({ status: 401 })
		await expect(POST(ev(good))).rejects.toMatchObject({ status: 401 })
		expect(recordMock).not.toHaveBeenCalled()
	})
	it('400 sur corps invalide (chemin hors coffre, lat hors bornes, JSON cassé)', async () => {
		await expect(POST(ev({ items: [{ path: 'chat/2026/09/22.json' }] }))).rejects.toMatchObject({ status: 400 })
		await expect(POST(ev({ items: [{ path: '2026/11/02/a.jpg', lat: 91, lng: 0 }] }))).rejects.toMatchObject({ status: 400 })
		await expect(POST({ request: { json: async () => { throw new Error('x') } } } as any)).rejects.toMatchObject({ status: 400 })
		expect(recordMock).not.toHaveBeenCalled()
	})
	it('succès : enregistre avec le nom de l\'utilisateur et ne renvoie JAMAIS le GPS', async () => {
		const res = await POST(ev(good))
		const text = JSON.stringify(await res.json())
		expect(JSON.parse(text)).toEqual({ ok: true, recorded: 1 })
		expect(text).not.toMatch(/11\.5|104\.9|lat|lng/)
		expect(recordMock).toHaveBeenCalledWith('Chet', [expect.objectContaining({ path: '2026/11/02/a.jpg', takenAt: '2026-11-02T07:15:30', lat: 11.5 })])
	})
	it('Postgres KO : 503 {ok:false} journalisé, pas une exception (le client ignore)', async () => {
		const err = vi.spyOn(console, 'error').mockImplementation(() => {})
		recordMock.mockRejectedValue(new Error('pg down'))
		const res = await POST(ev(good))
		expect(res.status).toBe(503)
		expect(await res.json()).toEqual({ ok: false })
		expect(err).toHaveBeenCalled()
		err.mockRestore()
	})
	it('schéma indisponible : même traitement', async () => {
		const err = vi.spyOn(console, 'error').mockImplementation(() => {})
		ensureMock.mockRejectedValue(new Error('no db'))
		expect((await POST(ev(good))).status).toBe(503)
		expect(recordMock).not.toHaveBeenCalled()
		err.mockRestore()
	})
})
