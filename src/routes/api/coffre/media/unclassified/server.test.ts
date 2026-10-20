import { describe, it, expect, vi, beforeEach } from 'vitest'

const requireAuthMock = vi.fn()
vi.mock('$lib/server/auth', () => ({ requireAuth: (e: unknown) => requireAuthMock(e) }))
const ensureMock = vi.fn()
vi.mock('$lib/server/coffre-db', () => ({ ensureCoffreSchema: () => ensureMock() }))
const countMock = vi.fn()
const listMock = vi.fn()
vi.mock('$lib/server/media-store', () => ({ countUnclassified: () => countMock(), listUnclassified: (...a: unknown[]) => listMock(...a) }))

import { GET } from './+server'
import { encodeCursor } from '$lib/server/events-validate'

const ev = (qs = '') => ({ url: new URL('http://t/api/coffre/media/unclassified' + qs), setHeaders: vi.fn() }) as any
const item = (i: number) => ({ path: `2026/10/${String(20 - i).padStart(2, '0')}/p${i}.jpg`, day: `2026-10-${String(20 - i).padStart(2, '0')}`, kind: 'image', size: 1 })

beforeEach(() => {
	for (const m of [requireAuthMock, ensureMock, countMock, listMock]) m.mockReset()
	requireAuthMock.mockResolvedValue({ id: 1 })
	ensureMock.mockResolvedValue(undefined)
	countMock.mockResolvedValue(120)
	listMock.mockResolvedValue([item(0), item(1)])
})

describe('GET /api/coffre/media/unclassified', () => {
	it('401 sans session', async () => {
		requireAuthMock.mockRejectedValue({ status: 401 })
		await expect(GET(ev())).rejects.toMatchObject({ status: 401 })
		expect(listMock).not.toHaveBeenCalled()
	})
	it('total + items, limite par défaut 50 (+1 pour savoir s\'il y a une suite)', async () => {
		const res = await GET(ev())
		expect(await res.json()).toEqual({ total: 120, items: [item(0), item(1)], nextCursor: null })
		expect(listMock).toHaveBeenCalledWith(51, null)
	})
	it('suite : nextCursor = clé du DERNIER élément rendu, pas du (limit+1)e', async () => {
		listMock.mockResolvedValue([item(0), item(1), item(2)])
		const body = await (await GET(ev('?limit=2'))).json()
		expect(body.items).toHaveLength(2)
		expect(body.nextCursor).toBe(encodeCursor(item(1).day, item(1).path))
	})
	it('curseur relu et transmis tel quel au store', async () => {
		const c = encodeCursor('2026-10-19', '2026/10/19/p1.jpg')
		await GET(ev(`?limit=10&cursor=${c}`))
		expect(listMock).toHaveBeenCalledWith(11, { day: '2026-10-19', path: '2026/10/19/p1.jpg' })
	})
	it('400 : limite hors 1..100, curseur falsifié (autre feature, jour impossible, pas du base64)', async () => {
		const bad = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
		for (const qs of ['?limit=0', '?limit=101', '?limit=abc', '?limit=-1', '?cursor=%%%', `?cursor=${bad({ d: '2026-10-19', p: 'chat/2026/09/22.json' })}`, `?cursor=${bad({ d: '2026-02-31', p: '2026/02/31/a.jpg' })}`, `?cursor=${bad('x')}`, `?cursor=${'a'.repeat(800)}`]) {
			await expect(GET(ev(qs)), qs).rejects.toMatchObject({ status: 400 })
		}
		expect(listMock).not.toHaveBeenCalled()
	})
	it('Postgres KO : 503 journalisé', async () => {
		const err = vi.spyOn(console, 'error').mockImplementation(() => {})
		countMock.mockRejectedValue(new Error('pg down'))
		await expect(GET(ev())).rejects.toMatchObject({ status: 503 })
		err.mockRestore()
	})
})
