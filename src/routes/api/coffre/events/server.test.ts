// Routes évènements : auth, validation, statuts, ordre écriture → traduction. Store/traduction mockés.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const requireAuthMock = vi.fn()
vi.mock('$lib/server/auth', () => ({ requireAuth: (e: unknown) => requireAuthMock(e) }))

const calls: string[] = []
vi.mock('$lib/server/coffre-db', () => ({ ensureCoffreSchema: vi.fn(async () => { calls.push('schema') }) }))

const store = {
	listEvents: vi.fn(), createEvent: vi.fn(), patchEvent: vi.fn(), softDeleteEvent: vi.fn(),
	listEventMedia: vi.fn(), addEventMedia: vi.fn(), removeEventMedia: vi.fn(), eventsForDate: vi.fn(),
}
vi.mock('$lib/server/events-store', () => ({
	listEvents: (...a: unknown[]) => store.listEvents(...a),
	createEvent: (...a: unknown[]) => { calls.push('create'); return store.createEvent(...a) },
	patchEvent: (...a: unknown[]) => { calls.push('patch'); return store.patchEvent(...a) },
	softDeleteEvent: (...a: unknown[]) => store.softDeleteEvent(...a),
	listEventMedia: (...a: unknown[]) => store.listEventMedia(...a),
	addEventMedia: (...a: unknown[]) => store.addEventMedia(...a),
	removeEventMedia: (...a: unknown[]) => store.removeEventMedia(...a),
	eventsForDate: (...a: unknown[]) => store.eventsForDate(...a),
}))

const translateMock = vi.fn()
vi.mock('$lib/server/events-names', () => ({
	scheduleNameTranslation: (...a: unknown[]) => { calls.push('translate'); return translateMock(...a) },
}))

import { GET, POST } from './+server'
import { PATCH, DELETE } from './[id]/+server'
import { GET as MGET, POST as MPOST, DELETE as MDELETE } from './[id]/media/+server'
import { GET as FGET } from './for-date/+server'
import { resetEventLimitsForTests } from '$lib/server/events-limits'

const setHeaders = vi.fn()
function ev(opts: { url?: string; body?: unknown; params?: Record<string, string>; rawBody?: string } = {}) {
	const url = new URL(opts.url ?? 'http://t.local/api/coffre/events')
	const request = { json: async () => { if (opts.rawBody !== undefined) return JSON.parse(opts.rawBody); return opts.body } }
	return { url, request, params: opts.params ?? {}, setHeaders } as any
}
const dto = (o: Record<string, unknown> = {}) => ({ id: 1, names: { fr: 'a', en: 'a', kh: 'a' }, version: 1, ...o })
const valid = { name: 'Disneyland Paris', dateStart: '2026-11-30' }

beforeEach(() => {
	calls.length = 0
	Object.values(store).forEach((m) => m.mockReset())
	translateMock.mockReset().mockReturnValue(true)
	requireAuthMock.mockReset().mockResolvedValue({ id: 5, name: 'Chet' })
	resetEventLimitsForTests()
})

describe('401', () => {
	it('toutes les routes refusent sans session', async () => {
		requireAuthMock.mockRejectedValue({ status: 401 })
		const p = { id: '1' }
		for (const call of [
			() => GET(ev()), () => POST(ev({ body: valid })), () => PATCH(ev({ params: p, body: {} })), () => DELETE(ev({ params: p })),
			() => MGET(ev({ params: p })), () => MPOST(ev({ params: p, body: {} })), () => MDELETE(ev({ params: p, body: {} })),
			() => FGET(ev({ url: 'http://t/x?d=2026-11-30' })),
		]) await expect(call()).rejects.toMatchObject({ status: 401 })
		expect(store.createEvent).not.toHaveBeenCalled()
	})
})

describe('GET /events', () => {
	it('liste en no-store, schéma garanti avant lecture', async () => {
		store.listEvents.mockResolvedValue([dto()])
		const res = await GET(ev())
		expect((await res.json()).events).toHaveLength(1)
		expect(setHeaders).toHaveBeenCalledWith({ 'cache-control': 'no-store' })
		expect(calls[0]).toBe('schema')
	})
	it('filtres year/place validés et transmis', async () => {
		store.listEvents.mockResolvedValue([])
		await GET(ev({ url: 'http://t/x?year=2026&place=Paris' }))
		expect(store.listEvents).toHaveBeenCalledWith(expect.objectContaining({ year: '2026', place: 'Paris' }))
		await expect(GET(ev({ url: 'http://t/x?year=20x6' }))).rejects.toMatchObject({ status: 400 })
		await expect(GET(ev({ url: 'http://t/x?place=' + 'a'.repeat(121) }))).rejects.toMatchObject({ status: 400 })
	})
})

describe('POST /events', () => {
	it('400 sur corps invalide, JSON cassé, sans rien écrire', async () => {
		await expect(POST(ev({ body: { name: '', dateStart: '2026-11-30' } }))).rejects.toMatchObject({ status: 400 })
		await expect(POST(ev({ body: { ...valid, dateStart: '2026-02-31' } }))).rejects.toMatchObject({ status: 400 })
		await expect(POST(ev({ body: { ...valid, mediaPaths: ['../x'] } }))).rejects.toMatchObject({ status: 400 })
		const bad = { json: async () => { throw new Error('x') } }
		await expect(POST({ ...ev(), request: bad } as any)).rejects.toMatchObject({ status: 400 })
		expect(store.createEvent).not.toHaveBeenCalled()
		expect(translateMock).not.toHaveBeenCalled()
	})
	it('crée avec le nom source dans les 3 langues, pending, puis traduit APRÈS l\'écriture (201)', async () => {
		store.createEvent.mockResolvedValue(dto({ id: 9 }))
		const res = await POST(ev({ body: { ...valid, mediaPaths: ['2026/11/30/a.jpg'] } }))
		expect(res.status).toBe(201)
		expect(store.createEvent).toHaveBeenCalledWith(
			5, expect.objectContaining({ name: 'Disneyland Paris', mediaPaths: ['2026/11/30/a.jpg'] }),
			{ fr: 'Disneyland Paris', en: 'Disneyland Paris', kh: 'Disneyland Paris', srcLang: 'fr', pending: true }, expect.any(String)
		)
		expect(translateMock).toHaveBeenCalledWith(5, 9, 'fr', 'Disneyland Paris')
		expect(calls.indexOf('create')).toBeLessThan(calls.indexOf('translate'))
	})
	it('langue source khmer détectée, ou donnée par le client', async () => {
		store.createEvent.mockResolvedValue(dto({ id: 3 }))
		await POST(ev({ body: { name: 'ទៅឌីស្នីឡែន', dateStart: '2026-11-30' } }))
		expect(translateMock).toHaveBeenLastCalledWith(5, 3, 'kh', 'ទៅឌីស្នីឡែន')
		await POST(ev({ body: { ...valid, nameLang: 'en' } }))
		expect(translateMock).toHaveBeenLastCalledWith(5, 3, 'en', 'Disneyland Paris')
	})
	it('une panne de traduction ne casse pas la création', async () => {
		store.createEvent.mockResolvedValue(dto())
		translateMock.mockReturnValue(false)
		expect((await POST(ev({ body: valid }))).status).toBe(201)
	})
	it('429 au-delà de 30 créations par heure et par utilisateur', async () => {
		store.createEvent.mockResolvedValue(dto())
		for (let i = 0; i < 30; i++) await POST(ev({ body: valid }))
		await expect(POST(ev({ body: valid }))).rejects.toMatchObject({ status: 429 })
		requireAuthMock.mockResolvedValue({ id: 6, name: 'Lys' })
		expect((await POST(ev({ body: valid }))).status).toBe(201)
	})
	it('les créations refusées par validation ne consomment pas le plafond', async () => {
		store.createEvent.mockResolvedValue(dto())
		for (let i = 0; i < 40; i++) await Promise.resolve(POST(ev({ body: { name: '' } }))).catch(() => {})
		expect((await POST(ev({ body: valid }))).status).toBe(201)
	})
})

describe('PATCH /events/:id', () => {
	const p = { id: '4' }
	it('400 id invalide / ifVersion absent', async () => {
		await expect(PATCH(ev({ params: { id: 'abc' }, body: { ifVersion: 1, place: 'x' } }))).rejects.toMatchObject({ status: 400 })
		await expect(PATCH(ev({ params: p, body: { place: 'x' } }))).rejects.toMatchObject({ status: 400 })
	})
	it('409 {current} sur version obsolète, sans traduction', async () => {
		store.patchEvent.mockResolvedValue({ kind: 'conflict', current: dto({ version: 3 }) })
		const res = await PATCH(ev({ params: p, body: { ifVersion: 1, name: 'Nouveau' } }))
		expect(res.status).toBe(409)
		expect((await res.json()).current.version).toBe(3)
		expect(translateMock).not.toHaveBeenCalled()
	})
	it('404 si introuvable ou supprimé', async () => {
		store.patchEvent.mockResolvedValue({ kind: 'not_found' })
		await expect(PATCH(ev({ params: p, body: { ifVersion: 1, place: 'x' } }))).rejects.toMatchObject({ status: 404 })
	})
	it('400 si le store signale une plage ou une couverture invalide', async () => {
		store.patchEvent.mockResolvedValue({ kind: 'invalid', message: 'invalid date range' })
		await expect(PATCH(ev({ params: p, body: { ifVersion: 1, dateEnd: '2026-01-01' } }))).rejects.toMatchObject({ status: 400 })
	})
	it('name → 3 langues = source, pending, retraduction après écriture', async () => {
		store.patchEvent.mockResolvedValue({ kind: 'ok', event: dto({ version: 2 }) })
		const res = await PATCH(ev({ params: p, body: { ifVersion: 1, name: 'Mariage de Sophie' } }))
		expect(res.status).toBe(200)
		expect(store.patchEvent).toHaveBeenCalledWith(4, expect.anything(),
			{ names: { fr: 'Mariage de Sophie', en: 'Mariage de Sophie', kh: 'Mariage de Sophie' }, srcLang: 'fr', namesPending: true }, expect.any(String))
		expect(translateMock).toHaveBeenCalledWith(5, 4, 'fr', 'Mariage de Sophie')
		expect(calls.indexOf('patch')).toBeLessThan(calls.indexOf('translate'))
		expect((await res.json()).translation).toBe('scheduled')
	})
	it('retraduction demandée au-delà des plafonds : réponse « limited » (le nom source reste, names_pending)', async () => {
		store.patchEvent.mockResolvedValue({ kind: 'ok', event: dto({ version: 2 }) })
		translateMock.mockReturnValue(false)
		const res = await PATCH(ev({ params: p, body: { ifVersion: 1, name: 'Mariage' } }))
		expect((await res.json()).translation).toBe('limited')
	})
	it('names manuels : jamais retraduits, pending levé', async () => {
		store.patchEvent.mockResolvedValue({ kind: 'ok', event: dto() })
		await PATCH(ev({ params: p, body: { ifVersion: 1, names: { kh: 'ឌីស្នី' } } }))
		expect(store.patchEvent).toHaveBeenCalledWith(4, expect.anything(), { names: { kh: 'ឌីស្នី' }, namesPending: false }, expect.any(String))
		expect(translateMock).not.toHaveBeenCalled()
	})
	it('autres champs : pas de retraduction', async () => {
		store.patchEvent.mockResolvedValue({ kind: 'ok', event: dto() })
		await PATCH(ev({ params: p, body: { ifVersion: 1, place: 'Paris', color: 'mint' } }))
		expect(translateMock).not.toHaveBeenCalled()
	})
})

describe('DELETE /events/:id', () => {
	it('soft delete, 404 si déjà supprimé, 400 id invalide', async () => {
		store.softDeleteEvent.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
		expect((await (await DELETE(ev({ params: { id: '2' } }))).json()).success).toBe(true)
		await expect(DELETE(ev({ params: { id: '2' } }))).rejects.toMatchObject({ status: 404 })
		await expect(DELETE(ev({ params: { id: '0' } }))).rejects.toMatchObject({ status: 400 })
	})
})

describe('/events/:id/media', () => {
	const p = { id: '2' }
	it('GET : liste ou 404', async () => {
		store.listEventMedia.mockResolvedValueOnce(['2026/11/30/a.jpg']).mockResolvedValueOnce(null)
		expect((await (await MGET(ev({ params: p }))).json()).paths).toEqual(['2026/11/30/a.jpg'])
		await expect(MGET(ev({ params: p }))).rejects.toMatchObject({ status: 404 })
	})
	it('POST : valide les chemins (400), ajoute (déplacement géré par le store), 404 si évènement absent', async () => {
		await expect(MPOST(ev({ params: p, body: { paths: ['chat/2026/09/22.json'] } }))).rejects.toMatchObject({ status: 400 })
		await expect(MPOST(ev({ params: p, body: { paths: [] } }))).rejects.toMatchObject({ status: 400 })
		store.addEventMedia.mockResolvedValueOnce({ added: ['2026/11/30/a.jpg'], skipped: [] }).mockResolvedValueOnce(false)
		const res = await MPOST(ev({ params: p, body: { paths: ['2026/11/30/a.jpg', '2026/11/30/a.jpg'] } }))
		expect(await res.json()).toEqual({ success: true, added: 1, skipped: [] })
		expect(store.addEventMedia).toHaveBeenCalledWith(2, 5, ['2026/11/30/a.jpg'], 'move') // défaut : déplacement explicite
		await expect(MPOST(ev({ params: p, body: { paths: ['2026/11/30/a.jpg'] } }))).rejects.toMatchObject({ status: 404 })
	})
	it('mode keep : transmis au store, les photos déjà rangées ailleurs sont rendues dans skipped', async () => {
		store.addEventMedia.mockResolvedValue({ added: ['2026/11/30/b.jpg'], skipped: [{ path: '2026/11/30/a.jpg', eventId: 9 }] })
		const res = await MPOST(ev({ params: p, body: { paths: ['2026/11/30/a.jpg', '2026/11/30/b.jpg'], mode: 'keep' } }))
		expect(await res.json()).toEqual({ success: true, added: 1, skipped: [{ path: '2026/11/30/a.jpg', eventId: 9 }] })
		expect(store.addEventMedia).toHaveBeenCalledWith(2, 5, ['2026/11/30/a.jpg', '2026/11/30/b.jpg'], 'keep')
	})
	it('mode inconnu : 400, rien n\'est écrit', async () => {
		for (const mode of ['overwrite', '', 1, null]) await expect(MPOST(ev({ params: p, body: { paths: ['2026/11/30/a.jpg'], mode } }))).rejects.toMatchObject({ status: 400 })
		expect(store.addEventMedia).not.toHaveBeenCalled()
	})
	it('DELETE : retire, 404 si évènement absent', async () => {
		store.removeEventMedia.mockResolvedValueOnce(2).mockResolvedValueOnce(null)
		expect((await (await MDELETE(ev({ params: p, body: { paths: ['2026/11/30/a.jpg'] } }))).json()).removed).toBe(2)
		await expect(MDELETE(ev({ params: p, body: { paths: ['2026/11/30/a.jpg'] } }))).rejects.toMatchObject({ status: 404 })
	})
})

describe('GET /events/for-date', () => {
	it('400 sur date impossible, sinon résultat du store', async () => {
		await expect(FGET(ev({ url: 'http://t/x?d=2026-02-31' }))).rejects.toMatchObject({ status: 400 })
		await expect(FGET(ev({ url: 'http://t/x' }))).rejects.toMatchObject({ status: 400 })
		store.eventsForDate.mockResolvedValue({ events: [dto()], tags: {}, tagEvents: [] })
		const res = await FGET(ev({ url: 'http://t/x?d=2026-11-30' }))
		expect((await res.json()).events).toHaveLength(1)
		expect(store.eventsForDate).toHaveBeenCalledWith('2026-11-30', expect.any(String))
	})
})
