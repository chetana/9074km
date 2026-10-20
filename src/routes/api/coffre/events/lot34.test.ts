// Lot 3-4 : export, suggestions, refus. Store/auth mockés.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const requireAuthMock = vi.fn()
vi.mock('$lib/server/auth', () => ({ requireAuth: (e: unknown) => requireAuthMock(e) }))
vi.mock('$lib/server/coffre-db', () => ({ ensureCoffreSchema: vi.fn(async () => {}) }))
const exportMock = vi.fn()
const liveMock = vi.fn()
vi.mock('$lib/server/events-store', () => ({ exportEvents: () => exportMock(), liveEventRanges: () => liveMock() }))
const unclMock = vi.fn()
const dismissalsMock = vi.fn()
const addDismissalMock = vi.fn()
vi.mock('$lib/server/media-store', () => ({ listUnclassifiedForSuggestions: () => unclMock(), listDismissals: () => dismissalsMock(), addDismissal: (...a: unknown[]) => addDismissalMock(...a) }))

import { GET as EXPORT } from './export/+server'
import { GET as SUGGEST } from './suggestions/+server'
import { POST as DISMISS } from './suggestions/dismiss/+server'
import { resetEventLimitsForTests } from '$lib/server/events-limits'

const ev = (o: { body?: unknown } = {}) => ({ request: { json: async () => o.body }, setHeaders: vi.fn() }) as any
const photos = (day: string, n: number) => Array.from({ length: n }, (_, i) => ({ path: `${day.replaceAll('-', '/')}/p${i}.jpg`, day, kind: 'image' as const }))

beforeEach(() => {
	for (const m of [requireAuthMock, exportMock, liveMock, unclMock, dismissalsMock, addDismissalMock]) m.mockReset()
	requireAuthMock.mockResolvedValue({ id: 5, name: 'Chet' })
	resetEventLimitsForTests()
})

describe('GET /events/export', () => {
	const sample = [{ id: 1, names: { fr: 'a', en: 'a', kh: 'a' }, nameSrcLang: 'fr', namesPending: false, coverPath: '2026/10/02/a.jpg', dates: { start: '2026-10-02', end: '2026-10-02' }, place: 'Lyon', emoji: '🚆', color: 'peach', autoAttach: true, version: 2, createdAt: '2026-10-01T10:00:00Z', photos: ['2026/10/02/a.jpg'] }]
	it('401 sans session', async () => {
		requireAuthMock.mockRejectedValue({ status: 401 })
		await expect(EXPORT(ev())).rejects.toMatchObject({ status: 401 })
		expect(exportMock).not.toHaveBeenCalled()
	})
	it('JSON téléchargeable : en-têtes attachment, évènements + chemins, versions et dates ; ni GPS ni uploader ni utilisateur', async () => {
		exportMock.mockResolvedValue(sample)
		const res = await EXPORT(ev())
		expect(res.headers.get('content-type')).toContain('application/json')
		expect(res.headers.get('content-disposition')).toMatch(/^attachment; filename="evenements-coffre-\d{4}-\d{2}-\d{2}\.json"$/)
		expect(res.headers.get('cache-control')).toBe('no-store')
		const text = await res.text()
		const body = JSON.parse(text)
		expect(body).toMatchObject({ format: 'coffre-evenements', formatVersion: 1, count: 1 })
		expect(body.events[0]).toMatchObject({ id: 1, version: 2, nameSrcLang: 'fr', namesPending: false, coverPath: '2026/10/02/a.jpg', dates: { start: '2026-10-02', end: '2026-10-02' }, photos: ['2026/10/02/a.jpg'] })
		expect(text).not.toMatch(/"(lat|lng|gps|latitude|longitude|uploaded_?by|uploadedBy|created_?by|email|make|model)"/i)
	})
	it('échec Postgres : 503 propre, quota NON décompté (6 exports réussis ensuite)', async () => {
		const err = vi.spyOn(console, 'error').mockImplementation(() => {})
		exportMock.mockRejectedValue(new Error('pg down'))
		for (let i = 0; i < 10; i++) await expect(EXPORT(ev())).rejects.toMatchObject({ status: 503 })
		exportMock.mockResolvedValue(sample)
		for (let i = 0; i < 6; i++) expect((await EXPORT(ev())).status).toBe(200)
		await expect(EXPORT(ev())).rejects.toMatchObject({ status: 429 })
		err.mockRestore()
	})
	it('6 exports par heure et par utilisateur : 429 ensuite, autre utilisateur libre', async () => {
		exportMock.mockResolvedValue(sample)
		for (let i = 0; i < 6; i++) await EXPORT(ev())
		await expect(EXPORT(ev())).rejects.toMatchObject({ status: 429 })
		requireAuthMock.mockResolvedValue({ id: 6, name: 'Lys' })
		expect((await EXPORT(ev())).status).toBe(200)
	})
})

describe('GET /events/suggestions', () => {
	it('401 sans session', async () => {
		requireAuthMock.mockRejectedValue({ status: 401 })
		await expect(SUGGEST(ev())).rejects.toMatchObject({ status: 401 })
	})
	it('calcule sur les photos à classer, les évènements vivants et les refus', async () => {
		unclMock.mockResolvedValue([...photos('2026-11-30', 38), ...photos('2026-12-10', 2)])
		liveMock.mockResolvedValue([{ id: 3, start: '2026-11-30', end: '2026-11-30' }])
		dismissalsMock.mockResolvedValue([])
		const body = await (await SUGGEST(ev())).json()
		expect(body.suggestions).toHaveLength(1)
		expect(body.suggestions[0]).toMatchObject({ start: '2026-11-30', count: 38, kind: 'attach', eventId: 3 })
	})
	it('un refus enregistré masque la suggestion', async () => {
		unclMock.mockResolvedValue(photos('2026-11-30', 10))
		liveMock.mockResolvedValue([])
		dismissalsMock.mockResolvedValue([{ start: '2026-11-30', end: '2026-11-30', count: 10 }])
		expect((await (await SUGGEST(ev())).json()).suggestions).toEqual([])
	})
	it('Postgres KO : 503 journalisé', async () => {
		const err = vi.spyOn(console, 'error').mockImplementation(() => {})
		unclMock.mockRejectedValue(new Error('pg down'))
		liveMock.mockResolvedValue([]); dismissalsMock.mockResolvedValue([])
		await expect(SUGGEST(ev())).rejects.toMatchObject({ status: 503 })
		err.mockRestore()
	})
})

describe('POST /events/suggestions/dismiss', () => {
	const ok = { start: '2026-11-02', end: '2026-11-04', count: 15 }
	it('401 sans session', async () => {
		requireAuthMock.mockRejectedValue({ status: 401 })
		await expect(DISMISS(ev({ body: ok }))).rejects.toMatchObject({ status: 401 })
		expect(addDismissalMock).not.toHaveBeenCalled()
	})
	it('enregistre (partagé : seul l\'auteur du refus est tracé)', async () => {
		addDismissalMock.mockResolvedValue(undefined)
		expect((await (await DISMISS(ev({ body: ok }))).json()).success).toBe(true)
		expect(addDismissalMock).toHaveBeenCalledWith(5, '2026-11-02', '2026-11-04', 15)
	})
	it('400 : plage inversée, jour impossible, plage trop longue, count négatif/fractionnaire/texte, clé inconnue, JSON cassé', async () => {
		for (const body of [{ ...ok, end: '2026-11-01' }, { ...ok, start: '2026-02-31' }, { ...ok, end: '2027-01-01' }, { ...ok, count: -1 }, { ...ok, count: 1.5 }, { ...ok, count: '5' }, { ...ok, x: 1 }, null, 'x']) {
			await expect(DISMISS(ev({ body })), JSON.stringify(body)).rejects.toMatchObject({ status: 400 })
		}
		await expect(DISMISS({ request: { json: async () => { throw new Error('x') } } } as any)).rejects.toMatchObject({ status: 400 })
		expect(addDismissalMock).not.toHaveBeenCalled()
	})
	it('Postgres KO : 503', async () => {
		const err = vi.spyOn(console, 'error').mockImplementation(() => {})
		addDismissalMock.mockRejectedValue(new Error('pg down'))
		await expect(DISMISS(ev({ body: ok }))).rejects.toMatchObject({ status: 503 })
		err.mockRestore()
	})
})
