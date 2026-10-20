import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'

vi.mock('./auth', () => ({ auth: { signOutSilent: vi.fn() } }))
import { addEventMedia, EventApiError, REQUEST_TIMEOUT_MS } from './events-api'

beforeEach(() => vi.useFakeTimers())
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('délai maximum des appels évènements', () => {
	it('15 s sans réponse : l\'appel est annulé et échoue en « réseau » (le toast propose Réessayer)', async () => {
		expect(REQUEST_TIMEOUT_MS).toBe(15000)
		vi.stubGlobal('fetch', vi.fn((_u: string, init: RequestInit) => new Promise((_, rej) => init.signal!.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))))))
		const p = addEventMedia(2, ['2026/10/11/a.jpg'], 'keep').then(() => 'ok', (e) => e)
		await vi.advanceTimersByTimeAsync(14_900)
		let settled = false
		void p.then(() => { settled = true })
		await Promise.resolve()
		expect(settled).toBe(false) // pas avant 15 s
		await vi.advanceTimersByTimeAsync(200)
		const e = await p
		expect(e).toBeInstanceOf(EventApiError)
		expect(e.status).toBe(0)
	})
	it('réponse rapide : résultat renvoyé, mode transmis, skipped lu', async () => {
		const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true, added: 0, skipped: [{ path: 'p', eventId: 6 }] })))
		vi.stubGlobal('fetch', fetchMock)
		const r = await addEventMedia(2, ['p'], 'keep')
		expect(r).toEqual({ added: 0, skipped: [{ path: 'p', eventId: 6 }] })
		expect(JSON.parse((fetchMock.mock.calls[0] as any)[1].body)).toEqual({ paths: ['p'], mode: 'keep' })
	})
	it('corps JSON illisible : échec réseau, pas de promesse pendante', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => new Response('pas du json')))
		await expect(addEventMedia(2, ['p'])).rejects.toMatchObject({ status: 0 })
	})
})
