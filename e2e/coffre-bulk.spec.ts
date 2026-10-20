import { test, expect, type Page } from '@playwright/test'
import sharp from 'sharp'
import { injectExif } from '../src/lib/exif'

// Sheet d'upload + date de prise de vue (EXIF) avec auth et API simulées : rien de réel n'est touché
// (S3, /api/coffre/*, __data.json interceptés). Viewport iPhone 14 Pro posé explicitement.
test.use({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#fcd"/></svg>'

async function photo(takenAt: string | null, offset = '+07:00', color = '#fcd'): Promise<Buffer> {
	const base = await sharp({ create: { width: 120, height: 90, channels: 3, background: color } }).jpeg().toBuffer()
	if (!takenAt) return base
	return Buffer.from(injectExif(new Uint8Array(base), { takenAt, offset, lat: 11.5564, lng: 104.9282, make: 'Apple', model: 'iPhone 14 Pro', orientation: 6 }))
}

async function setup(page: Page) {
	const puts: string[] = []
	const media: any[] = []
	const json = (r: any, b: unknown, s = 200) => r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b) })
	await page.route('**/api/auth/sign-in', (r) => r.fulfill({ status: 200, body: 'sign-in (simulé)' }))
	await page.route(/__data\.json/, (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ type: 'data', nodes: [{ type: 'data', data: [{ user: 1 }, { id: 2, email: 3, name: 4, picture: 5 }, 2, 'c@x.fr', 'Chet', ''], uses: {} }, { type: 'skip' }] }) }))
	await page.route('**/api/version', (r) => json(r, { version: '1.0.333' }))
	await page.route('**/api/coffre/og-image*', (r) => r.fulfill({ contentType: 'image/svg+xml', body: SVG }))
	await page.route('**/api/coffre/sign-download*', (r) => json(r, { url: 'data:image/svg+xml;base64,' + Buffer.from(SVG).toString('base64') }))
	await page.route('**/api/coffre/cover*', (r) => json(r, { cover: null }))
	await page.route('**/api/coffre/list*', (r) => json(r, { prefixes: [], items: [] }))
	await page.route(/\/api\/coffre\/(note|meta|reactions)/, (r) => (r.request().url().includes('note') ? r.fulfill({ body: '' }) : json(r, {})))
	await page.route('**/api/coffre/events**', (r) => json(r, { events: [], tags: {}, tagEvents: [] }))
	await page.route('**/api/coffre/sign-upload', (r) => json(r, { url: `https://s3.test/${JSON.parse(r.request().postData()!).path}` }))
	await page.route('https://s3.test/**', (r) => { puts.push(decodeURIComponent(new URL(r.request().url()).pathname.slice(1))); return r.fulfill({ status: 200, body: '' }) })
	await page.route('**/api/coffre/media', (r) => { media.push(JSON.parse(r.request().postData()!)); return json(r, { ok: true, recorded: 1 }) })
	return { puts, media }
}

async function openSheetAndPick(page: Page, files: { name: string; mimeType: string; buffer: Buffer }[]) {
	await page.goto('/coffre')
	await page.waitForSelector('.fab')
	await page.locator('.fab').click()
	await page.waitForSelector('.date-input')
	await page.locator('.date-input').fill('2026-11-20')
	const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: /Choisir des photos/ }).click()])
	await chooser.setFiles(files)
}


// Gros lots (250 fichiers) : lecture EXIF bornée, jamais d'envoi silencieux, 250 lignes `media`.
const DAYS = ['2026-07-02', '2026-07-03', '2026-07-05', '2026-07-08', '2026-07-09']
async function mixed(n: number) {
	const out: { name: string; mimeType: string; buffer: Buffer }[] = []
	const jpegBase = await sharp({ create: { width: 24, height: 18, channels: 3, background: '#fcd' } }).jpeg().toBuffer()
	const webp = await sharp({ create: { width: 24, height: 18, channels: 3, background: '#cdf' } }).webp().toBuffer()
	for (let i = 0; i < n; i++) {
		if (i % 5 < 3) {
			const takenAt = `${DAYS[i % DAYS.length]}T${String(8 + (i % 12)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00`
			out.push({ name: `IMG_${i}.jpg`, mimeType: 'image/jpeg', buffer: Buffer.from(injectExif(new Uint8Array(jpegBase), { takenAt, offset: '+02:00', lat: 48.85, lng: 2.35, make: 'Xiaomi', model: 'POCO F8 Ultra', orientation: 1 })) })
		} else out.push({ name: `IMG_${i}.webp`, mimeType: 'image/webp', buffer: webp }) // WebP : aucun EXIF
	}
	return out
}

test('250 fichiers JPEG+WebP : la feuille propose les dates, N sans date annoncées, 1 envoi par jour, 250 lignes media', async ({ page }) => {
	test.setTimeout(120_000)
	const { puts, media } = await setup(page)
	await openSheetAndPick(page, await mixed(250))
	await page.waitForSelector('.taken', { timeout: 60_000 })
	await expect(page.locator('.notice')).toContainText('100 photo(s) sans date de prise de vue')
	expect(puts).toEqual([]) // rien ne part avant la réponse
	await page.locator('.sheet:has(.taken) .btn-confirm').click()
	await expect.poll(() => puts.length, { timeout: 90_000 }).toBe(250)
	await expect.poll(() => media.flatMap((b) => b.items).length, { timeout: 30_000 }).toBe(250)
	const items = media.flatMap((b) => b.items) as { path: string; takenAt?: string }[]
	expect(new Set(items.map((i) => i.path)).size).toBe(250)
	const dated = items.filter((i) => i.takenAt)
	expect(dated).toHaveLength(150) // dates EXIF conservées dans l'index
	for (const it of dated) expect(it.path.slice(0, 10)).toBe(it.takenAt!.slice(0, 10).replaceAll('-', '/')) // un dossier par jour EXIF
	expect([...new Set(puts.map((p) => p.slice(0, 10)))].sort()).toEqual(['2026/07/02', '2026/07/03', '2026/07/05', '2026/11/20']) // 3 jours EXIF + date choisie (WebP sans EXIF)
})

test('lectures EXIF en échec : feuille « Réessayer la lecture », rien n\'est envoyé en silence, la relecture rétablit les dates', async ({ page }) => {
	await page.addInitScript(() => {
		const orig = File.prototype.slice
		;(window as any).__bad = true
		File.prototype.slice = function (this: File, ...a: [number?, number?, string?]) {
			if ((window as any).__bad && this.name.startsWith('BAD_')) return { arrayBuffer: () => Promise.reject(new Error('NotReadableError')) } as unknown as Blob
			return orig.apply(this, a)
		}
	})
	const { puts, media } = await setup(page)
	const base = await sharp({ create: { width: 24, height: 18, channels: 3, background: '#fcd' } }).jpeg().toBuffer()
	const withExif = (d: string) => Buffer.from(injectExif(new Uint8Array(base), { takenAt: `${d}T10:00:00`, offset: null, lat: null, lng: null, make: 'Xiaomi', model: null, orientation: 1 }))
	const files = [
		...Array.from({ length: 6 }, (_, i) => ({ name: `OK_${i}.jpg`, mimeType: 'image/jpeg', buffer: withExif('2026-07-08') })),
		...Array.from({ length: 4 }, (_, i) => ({ name: `BAD_${i}.jpg`, mimeType: 'image/jpeg', buffer: withExif('2026-07-02') }))
	]
	await openSheetAndPick(page, files)
	await page.waitForSelector('.taken')
	await expect(page.locator('.notice')).toContainText('Lecture impossible pour 4 photo(s)')
	expect(puts).toEqual([])
	await page.evaluate(() => { (window as any).__bad = false })
	await page.getByRole('button', { name: /Réessayer la lecture/ }).click()
	await page.waitForSelector('.taken')
	await expect(page.locator('.notice')).toHaveCount(0)
	await expect(page.locator('.taken-date')).toHaveCount(2) // 2 juillet (4 relues) + 8 juillet : dates rétablies
	await page.locator('.sheet:has(.taken) .btn-confirm').click()
	await expect.poll(() => puts.length).toBe(10)
	expect(puts.filter((p) => p.startsWith('2026/07/02/'))).toHaveLength(4)
	await expect.poll(() => media.flatMap((b) => b.items).length).toBe(10)
})
