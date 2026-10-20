import { describe, it, expect, vi, afterEach } from 'vitest'
import type { ExifData } from './exif'
import { planUploadDates, recordUploads, loadExif, countsLabel } from './upload-exif'

const f = (n: string, type = 'image/jpeg') => new File(['x'], n, { type })
const ex = (takenAt: string | null): ExifData => ({ takenAt, offset: null, lat: null, lng: null, make: null, model: null, orientation: null })

describe('planUploadDates', () => {
	it('aucune EXIF : comportement actuel, tout à la date choisie, pas de confirmation', () => {
		const files = [f('a.jpg'), f('b.jpg')]
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
		const m = await loadExif([img, vid])
		expect(m.has(vid)).toBe(false)
		expect(m.get(img)).toBeNull() // "x" n'est pas un JPEG
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
