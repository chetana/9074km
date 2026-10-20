// Compression Canvas simulée (pas de navigateur ici) : l'EXIF de l'original est lu AVANT, puis réinjecté dans le JPEG réduit.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import sharp from 'sharp'
import { compressImage } from './compressor'
import { injectExif, parseExif, type ExifData } from './exif'

const EXIF: ExifData = { takenAt: '2026-10-02T07:15:30', offset: '+07:00', lat: 11.5564, lng: 104.9282, make: 'Apple', model: 'iPhone 14 Pro', orientation: 6 }
let reduced: Uint8Array

beforeEach(async () => {
	reduced = new Uint8Array(await sharp({ create: { width: 64, height: 48, channels: 3, background: '#fcd' } }).jpeg().toBuffer()) // sortie « canvas » : sans EXIF
	vi.stubGlobal('createImageBitmap', async () => ({ width: 4000, height: 3000, close() {} }))
	vi.stubGlobal('OffscreenCanvas', class {
		getContext() { return { drawImage() {}, fillRect() {} } }
		async convertToBlob({ type }: { type: string }) {
			return type === 'image/jpeg' ? new Blob([reduced as BlobPart], { type }) : new Blob(['png'], { type: 'image/png' }) // façon Safari : pas de WebP
		}
	})
})
afterEach(() => vi.unstubAllGlobals())

const big = () => new File([new Uint8Array(600_000)], 'IMG_1.jpg', { type: 'image/jpeg' })

describe('compressImage + EXIF', () => {
	it('JPEG réduit : EXIF réinjecté, Orientation remise à 1 (pas de double rotation)', async () => {
		const r = await compressImage(big(), EXIF)
		expect(r.contentType).toBe('image/jpeg')
		const out = parseExif(new Uint8Array(await r.blob.arrayBuffer()))!
		expect(out).toMatchObject({ takenAt: '2026-10-02T07:15:30', offset: '+07:00', make: 'Apple', model: 'iPhone 14 Pro', orientation: 1 })
		expect(out.lat).toBeCloseTo(11.5564, 4)
		const meta = await sharp(Buffer.from(await r.blob.arrayBuffer())).metadata()
		expect([meta.width, meta.height]).toEqual([64, 48]) // toujours décodable
	})
	it('option désactivée : JPEG sans EXIF', async () => {
		const r = await compressImage(big(), EXIF, { reinjectExif: false })
		expect(parseExif(new Uint8Array(await r.blob.arrayBuffer()))).toBeNull()
	})
	it('sans EXIF lue : comportement inchangé', async () => {
		const r = await compressImage(big())
		expect(parseExif(new Uint8Array(await r.blob.arrayBuffer()))).toBeNull()
		expect(r.filename).toBe('IMG_1.jpg')
	})
	it('fichier < 500 Ko : renvoyé tel quel, EXIF d\'origine intacte (lecture identique)', async () => {
		const base = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#cdf' } }).jpeg().toBuffer()
		const small = new File([injectExif(new Uint8Array(base), EXIF) as BlobPart], 's.jpg', { type: 'image/jpeg' })
		const r = await compressImage(small, EXIF)
		expect(r.blob).toBe(small)
		const { readExif } = await import('./exif')
		expect((await readExif(r.blob))?.takenAt).toBe('2026-10-02T07:15:30')
	})
	it('vidéo : rien (ni compression ni EXIF)', async () => {
		const v = new File(['v'], 'v.mp4', { type: 'video/mp4' })
		expect((await compressImage(v, EXIF)).blob).toBe(v)
	})
	it('injecteur en échec : on garde le JPEG réduit sans casser l\'envoi', async () => {
		vi.doMock('./exif', () => ({ injectExif: () => { throw new Error('boom') } }))
		vi.resetModules()
		const { compressImage: fresh } = await import('./compressor')
		const r = await fresh(big(), EXIF)
		expect(r.contentType).toBe('image/jpeg')
		expect(r.blob.size).toBeGreaterThan(0)
		vi.doUnmock('./exif')
	})
})

describe('sortie toujours en JPEG 1600 px, original gardé en secours', () => {
	const sizes: number[][] = []
	beforeEach(() => {
		sizes.length = 0
		vi.stubGlobal('OffscreenCanvas', class {
			constructor(w: number, h: number) { sizes.push([w, h]) }
			getContext() { return { drawImage() {}, fillRect() {} } }
			async convertToBlob({ type }: { type: string }) {
				return type === 'image/webp' ? new Blob([new Uint8Array(100)], { type }) : new Blob([reduced as BlobPart], { type })
			}
		})
	})
	it('canvas capable de WebP (Chrome/Android) : JPEG quand même, jamais de WebP', async () => {
		const r = await compressImage(big(), null)
		expect(r.contentType).toBe('image/jpeg')
		expect(r.filename).toBe('IMG_1.jpg')
	})
	it('4000×3000 réduit à 1600×1200', async () => {
		await compressImage(big(), EXIF)
		expect(sizes).toEqual([[1600, 1200]])
	})
	it('portrait 3000×4000 réduit à 1200×1600', async () => {
		vi.stubGlobal('createImageBitmap', async () => ({ width: 3000, height: 4000, close() {} }))
		await compressImage(big(), EXIF)
		expect(sizes).toEqual([[1200, 1600]])
	})
	it('image déjà plus petite que 1600 px : pas d\'agrandissement', async () => {
		vi.stubGlobal('createImageBitmap', async () => ({ width: 1200, height: 900, close() {} }))
		await compressImage(big(), EXIF)
		expect(sizes).toEqual([[1200, 900]])
	})
	it('GIF : gardé tel quel (animation conservée)', async () => {
		const gif = new File([new Uint8Array(900_000)], 'a.gif', { type: 'image/gif' })
		const r = await compressImage(gif, null)
		expect(r.blob).toBe(gif)
		expect(sizes).toEqual([])
	})
	it('échec de décodage : on envoie le fichier d\'origine', async () => {
		vi.stubGlobal('createImageBitmap', async () => { throw new Error('HEIC illisible') })
		const f = big()
		const r = await compressImage(f, EXIF)
		expect(r.blob).toBe(f)
		expect(r.filename).toBe('IMG_1.jpg')
	})
	it('JPEG pas plus léger que l\'original : on envoie l\'original', async () => {
		const tiny = new File([new Uint8Array(500_000)], 'IMG_2.jpg', { type: 'image/jpeg' })
		vi.stubGlobal('OffscreenCanvas', class {
			getContext() { return { drawImage() {}, fillRect() {} } }
			async convertToBlob() { return new Blob([new Uint8Array(600_000)], { type: 'image/jpeg' }) }
		})
		const r = await compressImage(tiny, EXIF)
		expect(r.blob).toBe(tiny)
	})
})
