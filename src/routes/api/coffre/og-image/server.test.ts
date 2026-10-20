// Vie privée : og-image est PUBLIC (sans auth). Les previews ne doivent contenir aucune métadonnée (GPS, date, appareil).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import sharp from 'sharp'
import { injectExif, parseExif } from '$lib/exif'

vi.mock('$lib/server/gcs', () => ({ signedGetUrl: async (p: string) => `https://s3.test/${p}` }))
import { GET } from './+server'

const GPS = { takenAt: '2026-11-02T07:15:30', offset: '+07:00', lat: 11.5564, lng: 104.9282, make: 'Apple', model: 'iPhone 14 Pro', orientation: 1 }
let original: Buffer

beforeEach(async () => {
	const base = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#fcd' } }).jpeg().toBuffer()
	original = Buffer.from(injectExif(new Uint8Array(base), GPS))
	vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array(original), { status: 200 })))
})
afterEach(() => vi.unstubAllGlobals())

const call = async (w?: number) => {
	const url = new URL('http://t/api/coffre/og-image?path=2026/11/02/a.jpg' + (w ? `&w=${w}` : ''))
	const res = await GET({ url } as any)
	return Buffer.from(await res.arrayBuffer())
}

describe('og-image : aucune métadonnée dans les previews publiques', () => {
	it('le fichier source contient bien du GPS (sinon le test ne prouve rien)', async () => {
		expect(parseExif(new Uint8Array(original))).toMatchObject({ lat: 11.5564, lng: 104.9282 })
		expect((await sharp(original).metadata()).exif).toBeTruthy()
	})
	for (const w of [undefined, 400, 1200]) {
		it(`preview w=${w ?? 'défaut'} : ni EXIF, ni GPS, ni date, ni appareil`, async () => {
			const out = await call(w)
			expect(parseExif(new Uint8Array(out))).toBeNull()
			const meta = await sharp(out).metadata()
			expect(meta.exif).toBeUndefined()
			expect(out.includes(Buffer.from('Exif'))).toBe(false)
			expect(out.includes(Buffer.from('iPhone'))).toBe(false)
			expect(out.includes(Buffer.from('2026:11:02'))).toBe(false)
		})
	}
})
