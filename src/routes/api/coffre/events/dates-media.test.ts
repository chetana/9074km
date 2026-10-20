// Rattacher les photos des dates d'un évènement : routes (auth, validation, 404). Store mocké.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const requireAuthMock = vi.fn()
vi.mock('$lib/server/auth', () => ({ requireAuth: (e: unknown) => requireAuthMock(e) }))
vi.mock('$lib/server/coffre-db', () => ({ ensureCoffreSchema: vi.fn(async () => {}) }))
const countMock = vi.fn()
const attachMock = vi.fn()
vi.mock('$lib/server/events-store', () => ({ countUnattachedInRange: (...a: unknown[]) => countMock(...a), attachUnattachedInRange: (...a: unknown[]) => attachMock(...a) }))

import { GET, POST } from './[id]/dates-media/+server'

const ev = (id: string) => ({ params: { id }, setHeaders: vi.fn() }) as any
beforeEach(() => { for (const m of [requireAuthMock, countMock, attachMock]) m.mockReset(); requireAuthMock.mockResolvedValue({ id: 5, name: 'Chet' }) })

describe('/events/[id]/dates-media', () => {
	it('401 sans session : rien n\'est lu ni écrit', async () => {
		requireAuthMock.mockRejectedValue({ status: 401 })
		await expect(GET(ev('2'))).rejects.toMatchObject({ status: 401 })
		await expect(POST(ev('2'))).rejects.toMatchObject({ status: 401 })
		expect(countMock).not.toHaveBeenCalled(); expect(attachMock).not.toHaveBeenCalled()
	})
	it('id invalide : 400', async () => {
		for (const id of ['abc', '0', '-1', '1.5']) { await expect(GET(ev(id))).rejects.toMatchObject({ status: 400 }); await expect(POST(ev(id))).rejects.toMatchObject({ status: 400 }) }
	})
	it('GET renvoie le compteur calculé par le serveur ; 404 si évènement absent', async () => {
		countMock.mockResolvedValueOnce(37)
		expect(await (await GET(ev('2'))).json()).toEqual({ count: 37 })
		countMock.mockResolvedValueOnce(null)
		await expect(GET(ev('9'))).rejects.toMatchObject({ status: 404 })
	})
	it('POST rattache pour l\'utilisateur connecté ; 404 si évènement absent', async () => {
		attachMock.mockResolvedValueOnce({ added: 12 })
		expect(await (await POST(ev('2'))).json()).toEqual({ success: true, added: 12 })
		expect(attachMock).toHaveBeenCalledWith(2, 5)
		attachMock.mockResolvedValueOnce(false)
		await expect(POST(ev('9'))).rejects.toMatchObject({ status: 404 })
	})
})
