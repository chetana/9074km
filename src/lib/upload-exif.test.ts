import { describe, it, expect, vi, afterEach } from 'vitest'
import type { ExifData } from './exif'
import { planUploadDates, recordUploads, loadExif, countsLabel } from './upload-exif'

const f = (n: string, type = 'image/jpeg') => new File(['x'], n, { type })
const ex = (takenAt: string | null): ExifData => ({ takenAt, offset: null, lat: null, lng: null, make: null, model: null, orientation: null })

describe('planUploadDates', () => {
	it('une seule photo sans EXIF : comportement actuel, date choisie, pas de confirmation', () => {
		const files = [f('a.jpg')]
		const p = planUploadDates(files, new Map(), '2026-11-05')
		expect(p.needsConfirm).toBe(false)
		expect(p.byTaken).toEqual([{ date: '2026-11-05', files, fromExif: false }])
	})
	it('EXIF = date choisie : pas de confirmation', () => {
		const a = f('a.jpg')
		expect(planUploadDates([a], new Map([[a, ex('2026-11-05T23:59:00')]]), '2026-11-05').needsConfirm).toBe(false)
	})
	it('une date différente : confirmation, proposition = date de prise de vue (heure murale, pas de décalage UTC)', () => {
		const a = f('a.jpg'), b = f('b.jpg')
		const p = planUploadDates([a, b], new Map([[a, ex('2026-11-02T00:10:00')], [b, ex('2026-11-02T23:50:00')]]), '2026-11-20')
		expect(p.needsConfirm).toBe(true)
		expect(p.byTaken).toEqual([{ date: '2026-11-02', files: [a, b], fromExif: true }])
		expect(p.keep).toEqual([{ date: '2026-11-20', files: [a, b], fromExif: false }])
	})
	it('plusieurs jours : un groupe par date, triés ; sans EXIF et vidéos → date choisie', () => {
		const a = f('a.jpg'), b = f('b.jpg'), c = f('c.jpg'), v = f('v.mp4', 'video/mp4')
		const exif = new Map<File, ExifData | null>([[a, ex('2026-11-03T10:00:00')], [b, ex('2026-11-02T10:00:00')], [c, null]])
		const p = planUploadDates([a, b, c, v], exif, '2026-11-20')
		expect(p.byTaken.map((g) => [g.date, g.files.map((x) => x.name)])).toEqual([
			['2026-11-02', ['b.jpg']], ['2026-11-03', ['a.jpg']], ['2026-11-20', ['c.jpg', 'v.mp4']],
		])
	})
	it('EXIF présente mais sans date : ignorée', () => {
		const a = f('a.jpg')
		expect(planUploadDates([a], new Map([[a, ex(null)]]), '2026-11-05').needsConfirm).toBe(false)
	})
})

describe('loadExif', () => {
	it('ignore les vidéos, lit les images, ne lève jamais', async () => {
		const img = f('a.jpg'), vid = f('v.mp4', 'video/mp4')
		const { map: m, failed } = await loadExif([img, vid])
		expect(m.has(vid)).toBe(false)
		expect(m.get(img)).toBeNull() // "x" n'est pas un JPEG : lu, sans EXIF (≠ illisible)
		expect(failed).toEqual([])
	})
})

describe('recordUploads (best-effort)', () => {
	afterEach(() => vi.unstubAllGlobals())
	it('envoie chemin, taille et seulement les champs EXIF présents', async () => {
		const fetchMock = vi.fn(async () => new Response('{}'))
		vi.stubGlobal('fetch', fetchMock)
		await recordUploads([
			{ path: '2026/11/02/a.jpg', size: 10, exif: { ...ex('2026-11-02T07:15:30'), offset: '+07:00', lat: 11.5, lng: 104.9, make: 'Apple', model: 'iPhone' } },
			{ path: '2026/11/02/v.mp4', size: 20, exif: null },
		])
		const body = JSON.parse((fetchMock.mock.calls[0] as any)[1].body)
		expect(body.items[0]).toEqual({ path: '2026/11/02/a.jpg', size: 10, takenAt: '2026-11-02T07:15:30', takenOffset: '+07:00', lat: 11.5, lng: 104.9, make: 'Apple', model: 'iPhone' })
		expect(body.items[1]).toEqual({ path: '2026/11/02/v.mp4', size: 20 })
	})
	it('réseau ou serveur en échec : ne lève jamais', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
		await expect(recordUploads([{ path: '2026/11/02/a.jpg', size: 1, exif: null }])).resolves.toBeUndefined()
		vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })))
		await expect(recordUploads([{ path: '2026/11/02/a.jpg', size: 1, exif: null }])).resolves.toBeUndefined()
	})
	it('découpe par lots de 500 et ne fait rien si vide', async () => {
		const fetchMock = vi.fn(async () => new Response('{}'))
		vi.stubGlobal('fetch', fetchMock)
		await recordUploads([])
		expect(fetchMock).not.toHaveBeenCalled()
		await recordUploads(Array.from({ length: 1001 }, (_, i) => ({ path: `2026/11/02/p${i}.jpg`, size: 1, exif: null })))
		expect(fetchMock).toHaveBeenCalledTimes(3)
	})
})

describe('arrondi GPS (F6)', () => {
	afterEach(() => vi.unstubAllGlobals())
	it('lat/lng arrondis à 6 décimales avant l\'envoi', async () => {
		const fetchMock = vi.fn(async () => new Response('{}'))
		vi.stubGlobal('fetch', fetchMock)
		await recordUploads([{ path: '2026/10/02/a.jpg', size: 1, exif: { ...ex('2026-10-02T07:15:30'), lat: 11.55641234567891, lng: -104.92829999999 } }])
		const it = JSON.parse((fetchMock.mock.calls[0] as any)[1].body).items[0]
		expect(it.lat).toBe(11.556412)
		expect(it.lng).toBe(-104.9283)
	})
})

describe('countsLabel (F5)', () => {
	const img = (n: string) => new File(['x'], n, { type: 'image/jpeg' })
	const vid = (n: string) => new File(['x'], n, { type: 'video/mp4' })
	it('photos et vidéos comptées séparément, pluriels et khmer', () => {
		expect(countsLabel([img('a'), img('b'), vid('v')])).toEqual({ fr: '2 photos · 1 vidéo', kh: '2 រូបថត · 1 វីដេអូ' })
		expect(countsLabel([img('a')])).toEqual({ fr: '1 photo', kh: '1 រូបថត' })
		expect(countsLabel([vid('a'), vid('b')])).toEqual({ fr: '2 vidéos', kh: '2 វីដេអូ' })
	})
})

// --- Gros lots : 250 fichiers dont 40 lectures qui échouent ---
const many = (n: number) => Array.from({ length: n }, (_, i) => f(`IMG_${i}.jpg`))
const dayOf = (i: number) => `2026-07-${String(1 + (i % 10)).padStart(2, '0')}T10:00:00`

describe('loadExif sur un gros lot', () => {
	it('concurrence bornée à 4 et un échec par fichier ne perd JAMAIS les autres (40 échecs sur 250)', async () => {
		const files = many(250)
		let active = 0, maxActive = 0
		const bad = new Set(files.filter((_, i) => i % 6 === 0 && i < 240).map((x) => x.name)) // 40 fichiers
		const read = async (file: File) => {
			active++; maxActive = Math.max(maxActive, active)
			await new Promise((r) => setTimeout(r, 1))
			active--
			if (bad.has(file.name)) throw new Error('NotReadableError')
			return ex(dayOf(Number(file.name.match(/\d+/)![0])))
		}
		const progress: number[] = []
		const { map, failed } = await loadExif(files, { read, onProgress: (d) => progress.push(d) })
		expect(maxActive).toBeLessThanOrEqual(4)
		expect(failed).toHaveLength(40)
		expect(map.size).toBe(210)
		expect(progress.at(-1)).toBe(250)
	})
	it('un échec transitoire est retenté une fois (pas compté en échec)', async () => {
		const a = f('a.jpg'); let n = 0
		const { map, failed } = await loadExif([a], { read: async () => { if (n++ === 0) throw new Error('x'); return ex('2026-07-02T10:00:00') } })
		expect(failed).toEqual([]); expect(map.get(a)?.takenAt).toBe('2026-07-02T10:00:00')
	})
})

describe('planUploadDates : jamais d\'envoi silencieux d\'un lot mal lu', () => {
	it('250 fichiers dont 40 illisibles : confirmation obligatoire, échecs listés, dates conservées', () => {
		const files = many(250)
		const failed = files.slice(0, 40)
		const map = new Map(files.slice(40).map((x, i) => [x, ex(dayOf(i + 40))] as const))
		const plan = planUploadDates(files, map, '2026-07-08', failed)
		expect(plan.needsConfirm).toBe(true)
		expect(plan.failed).toHaveLength(40)
		expect(plan.byTaken.reduce((n, g) => n + g.files.length, 0)).toBe(250)
	})
	it('lecture ratée même si toutes les dates égalent la date choisie : on ne part pas en silence', () => {
		const a = f('a.jpg'), b = f('b.jpg')
		expect(planUploadDates([a, b], new Map([[a, ex('2026-07-08T09:00:00')]]), '2026-07-08', [b]).needsConfirm).toBe(true)
	})
	it('une partie sans EXIF alors que d\'autres en ont : prévenu, N comptées', () => {
		const a = f('a.jpg'), b = f('b.jpg'), c = f('c.jpg')
		const p = planUploadDates([a, b, c], new Map([[a, ex('2026-07-08T09:00:00')], [b, ex(null)], [c, ex(null)]]), '2026-07-08')
		expect(p.needsConfirm).toBe(true); expect(p.noDate).toBe(2)
	})
	it('aucun EXIF lisible dans un lot d\'images : avertit ; une image seule sans EXIF reste silencieuse', () => {
		const a = f('a.jpg'), b = f('b.jpg')
		const m = new Map([[a, ex(null)], [b, ex(null)]])
		expect(planUploadDates([a, b], m, '2026-07-08').noneReadable).toBe(true)
		expect(planUploadDates([a, b], m, '2026-07-08').needsConfirm).toBe(true)
		expect(planUploadDates([a], new Map([[a, ex(null)]]), '2026-07-08').needsConfirm).toBe(false)
	})
})

describe('recordUploads : statut vérifié, nouvelle tentative, lots de 500', () => {
	afterEach(() => vi.unstubAllGlobals())
	const items = (n: number) => Array.from({ length: n }, (_, i) => ({ path: `2026/07/08/IMG_${i}.jpg`, size: 1, exif: null }))
	it('1200 photos : 3 requêtes (500+500+200)', async () => {
		const calls: number[] = []
		await recordUploads(items(1200), (async (_u: any, init: any) => { calls.push(JSON.parse(init.body).items.length); return new Response('{}') }) as any)
		expect(calls).toEqual([500, 500, 200])
	})
	it('réponse 503 : une nouvelle tentative, puis journalisé ; les lots suivants partent quand même', async () => {
		const err = vi.spyOn(console, 'error').mockImplementation(() => {}); vi.spyOn(console, 'warn').mockImplementation(() => {})
		let n = 0
		await recordUploads(items(600), (async () => new Response('{}', { status: n++ < 2 ? 503 : 200 })) as any)
		expect(n).toBe(3) // lot 1 : 2 tentatives en échec ; lot 2 : 1 tentative réussie
		expect(err).toHaveBeenCalledTimes(1)
	})
	it('succès à la 2e tentative : aucun échec journalisé', async () => {
		const err = vi.spyOn(console, 'error').mockImplementation(() => {}); vi.spyOn(console, 'warn').mockImplementation(() => {})
		let n = 0
		await recordUploads(items(3), (async () => new Response('{}', { status: n++ === 0 ? 500 : 200 })) as any)
		expect(n).toBe(2); expect(err).not.toHaveBeenCalled()
	})
})
