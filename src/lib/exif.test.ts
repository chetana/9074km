import { describe, it, expect } from 'vitest'
import { parseExif, injectExif, buildExifSegment, readExif, type ExifData } from './exif'

// --- Constructeur de fixtures indépendant du code testé : TIFF little ou big endian, à la main ---
type E = { tag: number; type: number; vals: number[] | string }
function tiff(le: boolean, ifd0: E[], exif: E[] = [], gps: E[] = []): number[] {
	const w16 = (n: number) => (le ? [n & 255, n >> 8] : [n >> 8, n & 255])
	const w32 = (n: number) => (le ? [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255] : [(n >>> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255])
	const enc = (e: E): { count: number; data: number[] } => {
		if (typeof e.vals === 'string') { const d = [...Buffer.from(e.vals + '\0')]; return { count: d.length, data: d } }
		if (e.type === 3) return { count: e.vals.length, data: e.vals.flatMap(w16) }
		if (e.type === 4) return { count: e.vals.length, data: e.vals.flatMap(w32) }
		return { count: e.vals.length / 2, data: e.vals.flatMap(w32) } // RATIONAL : paires num/den
	}
	const groups = [ifd0, exif, gps].filter((g) => g.length)
	const sizeOf = (g: E[]) => 2 + g.length * 12 + 4 + g.reduce((n, e) => n + (enc(e).data.length > 4 ? enc(e).data.length : 0), 0)
	const starts: number[] = []; let at = 8
	for (const g of groups) { starts.push(at); at += sizeOf(g) }
	for (const e of ifd0) { if (e.tag === 0x8769) e.vals = [starts[1]]; if (e.tag === 0x8825) e.vals = [starts[groups.length - 1]] }
	const out = [...(le ? [0x49, 0x49] : [0x4d, 0x4d]), ...w16(42), ...w32(8)]
	groups.forEach((g, gi) => {
		let ex = starts[gi] + 2 + g.length * 12 + 4; const tail: number[] = []
		out.push(...w16(g.length))
		for (const e of g) {
			const { count, data } = enc(e)
			out.push(...w16(e.tag), ...w16(e.type), ...w32(count))
			if (data.length <= 4) out.push(...data, ...new Array(4 - data.length).fill(0)); else { out.push(...w32(ex)); tail.push(...data); ex += data.length }
		}
		out.push(0, 0, 0, 0, ...tail)
	})
	return out
}
const jpeg = (t?: number[], jfif = false): Uint8Array => {
	const seg = t ? (() => { const body = [...Buffer.from('Exif\0\0'), ...t]; return [0xff, 0xe1, (body.length + 2) >> 8, (body.length + 2) & 255, ...body] })() : []
	const app0 = jfif ? [0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0] : []
	return Uint8Array.from([0xff, 0xd8, ...app0, ...seg, 0xff, 0xdb, 0, 4, 0, 0, 0xff, 0xd9])
}
const ASCII = 2, SHORT = 3, LONG = 4, RAT = 5
const phone = (le: boolean, o: { dt?: string; off?: string; orient?: number; gps?: E[]; make?: string; model?: string } = {}) => tiff(le,
	[
		...(o.make ? [{ tag: 0x010f, type: ASCII, vals: o.make }] : []),
		...(o.model ? [{ tag: 0x0110, type: ASCII, vals: o.model }] : []),
		...(o.orient ? [{ tag: 0x0112, type: SHORT, vals: [o.orient] }] : []),
		...(o.dt ? [{ tag: 0x8769, type: LONG, vals: [0] }] : []),
		...(o.gps ? [{ tag: 0x8825, type: LONG, vals: [0] }] : []),
	],
	o.dt ? [{ tag: 0x9003, type: ASCII, vals: o.dt }, ...(o.off ? [{ tag: 0x9011, type: ASCII, vals: o.off }] : [])] : [],
	o.gps ?? [])
const gpsFor = (lat: [number, number, number, string], lng: [number, number, number, string]): E[] => [
	{ tag: 1, type: ASCII, vals: lat[3] }, { tag: 2, type: RAT, vals: [lat[0], 1, lat[1], 1, lat[2] * 100, 100] },
	{ tag: 3, type: ASCII, vals: lng[3] }, { tag: 4, type: RAT, vals: [lng[0], 1, lng[1], 1, lng[2] * 100, 100] },
]

describe('parseExif', () => {
	it('date + offset (heure murale conservée, pas de conversion UTC)', () => {
		const r = parseExif(jpeg(phone(true, { dt: '2026:10:02 07:15:30', off: '+07:00', make: 'Apple', model: 'iPhone 14 Pro' })))
		expect(r).toMatchObject({ takenAt: '2026-10-02T07:15:30', offset: '+07:00', make: 'Apple', model: 'iPhone 14 Pro', lat: null, lng: null })
	})
	it('sans offset : offset null', () => {
		expect(parseExif(jpeg(phone(true, { dt: '2026:10:02 23:59:59' })))).toMatchObject({ takenAt: '2026-10-02T23:59:59', offset: null })
	})
	it('big-endian (Motorola) identique à little-endian', () => {
		const a = parseExif(jpeg(phone(true, { dt: '2026:03:04 10:00:00', off: '-05:00', orient: 6, make: 'X' })))
		const b = parseExif(jpeg(phone(false, { dt: '2026:03:04 10:00:00', off: '-05:00', orient: 6, make: 'X' })))
		expect(b).toEqual(a)
		expect(b?.orientation).toBe(6)
	})
	it('orientation 6 et 8', () => {
		expect(parseExif(jpeg(phone(true, { orient: 6 })))?.orientation).toBe(6)
		expect(parseExif(jpeg(phone(true, { orient: 8 })))?.orientation).toBe(8)
		expect(parseExif(jpeg(phone(true, { orient: 9 })))).toBeNull() // hors 1..8 et rien d'autre
	})
	it('GPS nord/est puis sud/ouest, converti en décimal signé', () => {
		const ne = parseExif(jpeg(phone(true, { gps: gpsFor([48, 51, 30, 'N'], [2, 21, 0, 'E']) })))!
		expect(ne.lat).toBeCloseTo(48.85833, 4)
		expect(ne.lng).toBeCloseTo(2.35, 4)
		const sw = parseExif(jpeg(phone(false, { gps: gpsFor([33, 52, 0, 'S'], [70, 39, 0, 'W']) })))!
		expect(sw.lat).toBeCloseTo(-33.86667, 4)
		expect(sw.lng).toBeCloseTo(-70.65, 4)
	})
	it('GPS hors bornes ou dénominateur nul : ignoré', () => {
		expect(parseExif(jpeg(phone(true, { dt: '2026:01:01 00:00:00', gps: gpsFor([95, 0, 0, 'N'], [2, 0, 0, 'E']) })))).toMatchObject({ lat: null, lng: null })
		const bad = gpsFor([48, 0, 0, 'N'], [2, 0, 0, 'E']); bad[1].vals = [48, 0, 0, 1, 0, 1]
		expect(parseExif(jpeg(phone(true, { dt: '2026:01:01 00:00:00', gps: bad })))?.lat).toBeNull()
	})
	it('JPEG sans EXIF, ou avec JFIF seul : null', () => {
		expect(parseExif(jpeg())).toBeNull()
		expect(parseExif(jpeg(undefined, true))).toBeNull()
	})
	it('EXIF placé après un APP0 JFIF', () => {
		expect(parseExif(jpeg(phone(true, { dt: '2026:10:02 07:15:30' }), true))?.takenAt).toBe('2026-10-02T07:15:30')
	})
	it('dates impossibles ou nulles : takenAt null', () => {
		for (const dt of ['0000:00:00 00:00:00', '2026:02:31 10:00:00', '2026:13:01 10:00:00', '2026:01:01 25:00:00', 'pas une date', '2026:01:01']) {
			expect(parseExif(jpeg(phone(true, { dt, make: 'M' })))?.takenAt, dt).toBeNull()
		}
	})
	it('offset mal formé : ignoré', () => {
		for (const off of ['0700', '+7:00', '+25:00', '+07:61', 'UTC']) expect(parseExif(jpeg(phone(true, { dt: '2026:01:01 10:00:00', off })))?.offset, off).toBeNull()
	})
	it('EXIF tronqué à chaque longueur : jamais d\'exception', () => {
		const full = jpeg(phone(true, { dt: '2026:10:02 07:15:30', off: '+07:00', make: 'Apple', model: 'iPhone', orient: 6, gps: gpsFor([48, 51, 30, 'N'], [2, 21, 0, 'E']) }))
		for (let n = 0; n < full.length; n++) expect(() => parseExif(full.slice(0, n))).not.toThrow()
		expect(parseExif(full.slice(0, 30))).toBeNull()
	})
	it('octets aléatoires et entrées bizarres : null sans exception', () => {
		let seed = 7
		const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) & 255
		for (let i = 0; i < 300; i++) {
			const b = Uint8Array.from({ length: 5 + (i % 200) }, rnd); b[0] = 0xff; b[1] = 0xd8
			expect(() => parseExif(b)).not.toThrow()
		}
		expect(parseExif(new Uint8Array(0))).toBeNull()
		expect(parseExif(Uint8Array.of(1, 2, 3, 4))).toBeNull()
	})
	it('IFD pointant en dehors du fichier ou en boucle : null/pas de boucle infinie', () => {
		const t = phone(true, { dt: '2026:10:02 07:15:30' })
		const loop = [...t]; loop[4] = 8; loop[5] = 0 // IFD0 → lui-même : lisible, mais pas de récursion
		expect(() => parseExif(jpeg(loop))).not.toThrow()
		const out = [...t]; out[4] = 0xff; out[5] = 0xff; out[6] = 0xff; out[7] = 0x7f
		expect(parseExif(jpeg(out))).toBeNull()
	})
	it('readExif (Blob) : lit les premiers octets', async () => {
		const blob = new Blob([jpeg(phone(true, { dt: '2026:10:02 07:15:30' })) as BlobPart])
		expect((await readExif(blob))?.takenAt).toBe('2026-10-02T07:15:30')
		expect(await readExif(new Blob([Uint8Array.of(1, 2, 3) as BlobPart]))).toBeNull()
	})
})

describe('injectExif', () => {
	const full: ExifData = { takenAt: '2026-10-02T07:15:30', offset: '+07:00', lat: -33.86667, lng: -70.65, make: 'Apple', model: 'iPhone 14 Pro', orientation: 6 }
	it('relecture : tout est conservé, Orientation remise à 1', () => {
		const out = injectExif(jpeg(undefined, true), full)
		const r = parseExif(out)!
		expect(r).toMatchObject({ takenAt: '2026-10-02T07:15:30', offset: '+07:00', make: 'Apple', model: 'iPhone 14 Pro', orientation: 1 })
		expect(r.lat).toBeCloseTo(-33.86667, 4)
		expect(r.lng).toBeCloseTo(-70.65, 4)
	})
	it('JPEG de sortie structurellement valide : SOI, JFIF d\'abord, APP1 ensuite, reste intact', () => {
		const src = jpeg(undefined, true)
		const out = injectExif(src, full)
		expect([out[0], out[1]]).toEqual([0xff, 0xd8])
		expect([out[2], out[3]]).toEqual([0xff, 0xe0])
		const app1 = 4 + 16
		expect([out[app1], out[app1 + 1]]).toEqual([0xff, 0xe1])
		const len = (out[app1 + 2] << 8) | out[app1 + 3]
		expect(out.slice(app1 + 2 + len)).toEqual(src.slice(20))
	})
	it('sans JFIF : APP1 juste après SOI', () => {
		const out = injectExif(jpeg(), { ...full, lat: null, lng: null })
		expect([out[2], out[3]]).toEqual([0xff, 0xe1])
		expect(parseExif(out)?.lat).toBeNull()
	})
	it('partiel : date seule, ou rien d\'utile → JPEG inchangé', () => {
		expect(parseExif(injectExif(jpeg(), { ...full, offset: null, lat: null, lng: null, make: null, model: null }))?.takenAt).toBe('2026-10-02T07:15:30')
		const src = jpeg()
		expect(injectExif(src, { takenAt: null, offset: null, lat: null, lng: null, make: null, model: null, orientation: 6 })).toBe(src)
	})
	it('entrée qui n\'est pas un JPEG : renvoyée telle quelle', () => {
		const png = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4)
		expect(injectExif(png, full)).toBe(png)
	})
	it('segment APP1 < 64 Ko et longueur cohérente', () => {
		const seg = buildExifSegment(full)!
		expect(((seg[2] << 8) | seg[3]) + 2).toBe(seg.length)
		expect(seg.length).toBeLessThan(1000)
	})
	it('accepte un vrai JPEG produit par sharp (si disponible) et le garde décodable', async () => {
		let sharp: any
		try { sharp = (await import('sharp')).default } catch { return }
		const base = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#fcd' } }).jpeg().toBuffer()
		const out = injectExif(new Uint8Array(base), full)
		const meta = await sharp(Buffer.from(out)).metadata()
		expect([meta.width, meta.height]).toEqual([64, 48])
		expect(meta.exif).toBeTruthy()
		expect(parseExif(out)?.takenAt).toBe('2026-10-02T07:15:30')
	})
})

describe('lecteur indépendant (ImageMagick, si installé)', () => {
	it('relit le segment injecté : date, offset, GPS, marque/modèle', async () => {
		const { execFileSync } = await import('node:child_process')
		const { writeFileSync, mkdtempSync, rmSync } = await import('node:fs')
		const { tmpdir } = await import('node:os')
		const { join } = await import('node:path')
		try { execFileSync('magick', ['-version'], { stdio: 'ignore' }) } catch { return }
		let sharp: any
		try { sharp = (await import('sharp')).default } catch { return }
		const dir = mkdtempSync(join(tmpdir(), 'exif-'))
		try {
			const base = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#fcd' } }).jpeg().toBuffer()
			const out = injectExif(new Uint8Array(base), { takenAt: '2026-10-02T07:15:30', offset: '+07:00', lat: 48.5, lng: -2.25, make: 'Apple', model: 'iPhone', orientation: 6 })
			const f = join(dir, 'x.jpg')
			writeFileSync(f, out)
			const id = (fmt: string) => execFileSync('magick', ['identify', '-format', fmt, f]).toString()
			expect(id('%[EXIF:DateTimeOriginal]')).toBe('2026:10:02 07:15:30')
			expect(id('%[EXIF:OffsetTimeOriginal]')).toBe('+07:00')
			expect(id('%[EXIF:GPSLatitudeRef]%[EXIF:GPSLongitudeRef]')).toBe('NW')
			expect(id('%[EXIF:Make]/%[EXIF:Model]')).toBe('Apple/iPhone')
			expect(id('%[orientation]')).toBe('TopLeft')
		} finally { rmSync(dir, { recursive: true, force: true }) }
	})
})

describe('horloge d\'appareil fausse (F4)', () => {
	const NOW = Date.UTC(2026, 9, 20, 12, 0, 0) // 20/10/2026 12:00 UTC
	const at = (dt: string) => parseExif(jpeg(phone(true, { dt, make: 'Apple' })), NOW)?.takenAt
	it('aujourd\'hui, hier et demain (décalage horaire) acceptés', () => {
		expect(at('2026:10:20 09:00:00')).toBe('2026-10-20T09:00:00')
		expect(at('2026:10:19 23:59:59')).toBe('2026-10-19T23:59:59')
		expect(at('2026:10:21 05:00:00')).toBe('2026-10-21T05:00:00')
	})
	it('après-demain et au-delà : écartées (null), le reste de l\'EXIF est gardé', () => {
		expect(at('2026:10:22 00:00:00')).toBeNull()
		expect(at('2030:01:01 00:00:00')).toBeNull()
		expect(parseExif(jpeg(phone(true, { dt: '2030:01:01 00:00:00', make: 'Apple' })), NOW)).toMatchObject({ takenAt: null, make: 'Apple' })
	})
	it('avant 1990 (horloge à zéro) : écartées', () => {
		expect(at('1989:12:31 23:59:59')).toBeNull()
		expect(at('1970:01:01 00:00:00')).toBeNull()
		expect(at('1990:01:01 00:00:00')).toBe('1990-01-01T00:00:00')
	})
	it('une date écartée n\'emporte pas l\'offset', () => {
		expect(parseExif(jpeg(phone(true, { dt: '2030:01:01 00:00:00', off: '+07:00', make: 'M' })), NOW)?.offset).toBeNull()
	})
})
