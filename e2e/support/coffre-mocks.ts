import type { Page } from '@playwright/test'

// Simulation complète du coffre pour les specs « écrans » (captures, mesures, bypass) : S3, /api/coffre/* et — selon le
// mode — l'authentification. Rien de réel n'est touché : toutes les requêtes API sont interceptées dans le navigateur.
export const IPHONE_14_PRO = { width: 393, height: 852 } as const

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fbc"/><stop offset="1" stop-color="#cdf"/></linearGradient></defs><rect width="400" height="400" fill="url(#g)"/><circle cx="140" cy="150" r="60" fill="#fff8"/><path d="M0 400 L150 240 L300 400Z" fill="#8a6a7a55"/></svg>'

export const ev = (id: number, fr: string, kh: string, start: string, end: string, o: Record<string, unknown> = {}) => ({
	id, names: { fr, en: fr, kh }, nameSrcLang: 'fr', namesPending: false, dates: { start, end }, cover: null, place: null,
	emoji: '🚆', color: 'peach', autoAttach: true, version: 1, count: 3, upcoming: false, ...o,
})
export const LYON = ev(2, 'Week-end à Lyon', 'ចុងសប្តាហ៍នៅលីយ៉ុង', '2026-10-10', '2026-10-12', { place: 'Lyon', cover: '2026/10/11/p00.jpg', count: 14 })
export const BIRTH = ev(6, 'Anniversaire de Lys', 'ថ្ងៃកំណើតលីស', '2026-09-05', '2026-09-05', { emoji: '🎂', color: 'gold', place: 'Phnom Penh', cover: '2026/10/11/p01.jpg', count: 32 })
export const NOEL = ev(8, 'Noël à Paris', 'បុណ្យណូអែល', '2025-12-24', '2025-12-26', { emoji: '🎄', color: 'mint', place: 'Paris', namesPending: true })
export const DISNEY = ev(9, 'Disneyland Paris', 'ឌីស្នីឡែន ប៉ារីស', '2026-11-30', '2026-11-30', { emoji: '🎢', color: 'lavender', place: 'Marne-la-Vallée', upcoming: true, count: 0 })
export const ALL_EVENTS = [LYON, BIRTH, NOEL, DISNEY]

export const photoPaths = (day: string, n: number) => Array.from({ length: n }, (_, i) => `${day.replaceAll('-', '/')}/p${String(i).padStart(2, '0')}.jpg`)
export const unclassifiedItem = (path: string, day: string, kind = 'image', by: string | null = 'Chet') => ({ path, day, kind, size: 1, uploadedBy: by })

export interface CoffreMockOptions {
	/** 'intercept' : __data.json et sign-in simulés (specs historiques). 'real' : la vraie pile, session E2E_AUTH_USER du serveur dev. */
	auth?: 'intercept' | 'real'
	user?: string
	events?: any[]
	suggestions?: any[]
	unclassified?: any[]
	mediaPaths?: string[]
	versionOk?: boolean
}

export interface MockCalls { m: string; url: string; body: any }

export async function mockCoffre(page: Page, o: CoffreMockOptions = {}) {
	const calls: MockCalls[] = []
	const events = o.events ?? ALL_EVENTS
	const rec = (r: any) => { const p = r.request().postData(); calls.push({ m: r.request().method(), url: new URL(r.request().url()).pathname, body: p ? JSON.parse(p) : null }) }
	const json = (r: any, b: unknown, s = 200) => r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b) })
	if (o.auth !== 'real') {
		await page.route('**/api/auth/sign-in', (r) => r.fulfill({ status: 200, body: 'sign-in (simulé)' }))
		await page.route(/__data\.json/, (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ type: 'data', nodes: [{ type: 'data', data: [{ user: 1 }, { id: 2, email: 3, name: 4, picture: 5 }, 2, 'c@x.fr', o.user ?? 'Chet Yin', ''], uses: {} }, { type: 'skip' }] }) }))
	}
	await page.route('**/api/version', (r) => json(r, { version: '1.0.337' }))
	await page.route('**/api/coffre/og-image*', (r) => r.fulfill({ contentType: 'image/svg+xml', body: SVG }))
	await page.route('**/api/coffre/sign-download*', (r) => json(r, { url: 'data:image/svg+xml;base64,' + Buffer.from(SVG).toString('base64') }))
	await page.route('**/api/coffre/cover*', (r) => json(r, { cover: '2026/10/11/p00.jpg' }))
	await page.route('**/api/coffre/list*', (r) => {
		const prefix = new URL(r.request().url()).searchParams.get('prefix') ?? ''
		if (prefix === '') return json(r, { prefixes: ['2025/', '2026/'], items: [] })
		if (prefix === '2025/') return json(r, { prefixes: ['2025/12/'], items: [] })
		if (prefix === '2026/') return json(r, { prefixes: ['2026/09/', '2026/10/'], items: [] })
		if (prefix === '2026/10/') return json(r, { prefixes: ['2026/10/10/', '2026/10/11/', '2026/10/12/'], items: [] })
		if (prefix === '2026/10/11/') return json(r, { prefixes: [], items: photoPaths('2026-10-11', 6).map((name) => ({ name, size: 1, updated: '' })) })
		return json(r, { prefixes: [], items: [] })
	})
	await page.route(/\/api\/coffre\/(note|meta|reactions)/, (r) => (r.request().url().includes('note') ? r.fulfill({ body: '' }) : json(r, r.request().url().includes('meta') ? { 'p00.jpg': 'Chet', 'p01.jpg': 'Lys' } : {})))
	await page.route('**/api/coffre/events/for-date*', (r) => {
		const d = new URL(r.request().url()).searchParams.get('d')!
		json(r, { events: events.filter((e) => e.dates.start <= d && e.dates.end >= d), tags: d === '2026-10-11' ? { '2026/10/11/p02.jpg': 2, '2026/10/11/p03.jpg': 2 } : {}, tagEvents: d === '2026-10-11' ? [LYON] : [] })
	})
	await page.route('**/api/coffre/events/suggestions/dismiss', (r) => { rec(r); json(r, { success: true }) })
	await page.route('**/api/coffre/events/suggestions', (r) => json(r, { suggestions: o.suggestions ?? [] }))
	await page.route('**/api/coffre/events/export', (r) => { rec(r); r.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-disposition': 'attachment; filename="evenements-coffre-2026-10-20.json"' }, body: JSON.stringify({ format: 'coffre-evenements', formatVersion: 1, count: events.length, events: events.map((e) => ({ id: e.id, names: e.names, photos: [] })) }) }) })
	await page.route(/\/api\/coffre\/events\/\d+\/media/, (r) => {
		rec(r)
		if (r.request().method() === 'GET') return json(r, { paths: o.mediaPaths ?? [...photoPaths('2026-10-10', 4), ...photoPaths('2026-10-11', 6), '2026/10/12/clip.mp4'] })
		const b = JSON.parse(r.request().postData() ?? '{}')
		return json(r, { success: true, added: (b.paths ?? []).length, skipped: [] })
	})
	await page.route(/\/api\/coffre\/events\/\d+$/, (r) => {
		rec(r)
		if (r.request().method() === 'DELETE') return json(r, { success: true })
		const id = Number(/events\/(\d+)$/.exec(r.request().url())![1])
		const base = events.find((e) => e.id === id) ?? events[0]
		const b = JSON.parse(r.request().postData() ?? '{}')
		return json(r, { event: { ...base, version: base.version + 1, cover: b.coverPath ?? base.cover }, translation: 'scheduled' })
	})
	await page.route(/\/api\/coffre\/events(\?.*)?$/, (r) => {
		if (r.request().method() === 'POST') { rec(r); const b = JSON.parse(r.request().postData()!); return json(r, { event: ev(99, b.name, b.name, b.dateStart, b.dateEnd, { emoji: b.emoji ?? null, count: 0 }), translation: 'scheduled' }, 201) }
		return json(r, { events })
	})
	await page.route('**/api/coffre/media/unclassified*', (r) => { const items = o.unclassified ?? []; json(r, { total: items.length, items, nextCursor: null }) })
	await page.route('**/api/coffre/media/skip', (r) => { rec(r); json(r, { success: true, updated: 1 }) })
	await page.route('**/api/coffre/sign-upload', (r) => json(r, { url: `https://s3.test/${JSON.parse(r.request().postData()!).path}` }))
	await page.route('https://s3.test/**', (r) => r.fulfill({ status: 200, body: '' }))
	await page.route('**/api/coffre/media', (r) => { rec(r); json(r, { ok: true, recorded: 1 }) })
	return { calls }
}
