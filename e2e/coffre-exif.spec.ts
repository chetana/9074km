import { test, expect, type Page } from '@playwright/test'
import sharp from 'sharp'
import { injectExif } from '../src/lib/exif'

// Sheet d'upload + date de prise de vue (EXIF) avec auth et API simulées : rien de réel n'est touché
// (S3, /api/coffre/*, __data.json interceptés). Viewport iPhone 14 Pro posé explicitement.
test.describe.configure({ mode: 'serial' })
test.use({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
const SHOTS = process.env.SHOTS_DIR

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

test('EXIF d\'un autre jour : la date de prise de vue est proposée, pas imposée ; acceptée → envoi à cette date + index EXIF', async ({ page }) => {
	const { puts, media } = await setup(page)
	await openSheetAndPick(page, [{ name: 'IMG_1.jpg', mimeType: 'image/jpeg', buffer: await photo('2026-10-02T07:15:30') }])
	await page.waitForSelector('.taken')
	await expect(page.locator('.taken-title')).toHaveText('Photos prises le')
	await expect(page.locator('.taken-date')).toContainText('2 octobre 2026')
	await expect(page.locator('.taken-n')).toContainText('1 photo ·')
	await expect(page.locator('.fab')).toHaveCount(0) // le FAB ne passe plus par-dessus la feuille
	expect(puts).toEqual([]) // rien n'est parti avant la réponse
	for (const sel of ['.taken-title-kh', '.sheet:has(.taken) .btn-confirm .kh', '.btn-keep .kh', '.taken-q-kh']) {
		expect(await page.locator(sel).first().evaluate((e) => parseFloat(getComputedStyle(e).fontSize)), sel).toBeGreaterThanOrEqual(18)
	}
	await page.waitForTimeout(700)
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/01-confirmation-date-unique.png` })
	await page.getByRole('button', { name: /^Oui, / }).click()
	await expect.poll(() => puts).toEqual(['2026/10/02/IMG_1.jpg'])
	await expect.poll(() => media.length).toBe(1)
	expect(media[0].items[0]).toMatchObject({ path: '2026/10/02/IMG_1.jpg', takenAt: '2026-10-02T07:15:30', takenOffset: '+07:00', lat: 11.5564, lng: 104.9282, make: 'Apple', model: 'iPhone 14 Pro' })
})

test('« garder la date choisie » : envoi à la date du sheet, EXIF quand même indexée', async ({ page }) => {
	const { puts, media } = await setup(page)
	await openSheetAndPick(page, [{ name: 'IMG_2.jpg', mimeType: 'image/jpeg', buffer: await photo('2026-10-02T07:15:30') }])
	await page.waitForSelector('.taken')
	await page.locator('.btn-keep').click()
	await expect.poll(() => puts).toEqual(['2026/11/20/IMG_2.jpg'])
	await expect.poll(() => media.length).toBe(1)
	expect(media[0].items[0].path).toBe('2026/11/20/IMG_2.jpg')
})

test('annuler : rien n\'est envoyé', async ({ page }) => {
	const { puts, media } = await setup(page)
	await openSheetAndPick(page, [{ name: 'IMG_3.jpg', mimeType: 'image/jpeg', buffer: await photo('2026-10-02T07:15:30') }])
	await page.waitForSelector('.taken')
	await page.locator('.sheet .btn-cancel').last().click()
	await page.waitForTimeout(500)
	expect(puts).toEqual([])
	expect(media).toEqual([])
})

test('plusieurs jours : un envoi par date après confirmation', async ({ page }) => {
	const { puts } = await setup(page)
	await openSheetAndPick(page, [
		{ name: 'a.jpg', mimeType: 'image/jpeg', buffer: await photo('2026-10-02T07:15:30') },
		{ name: 'b.jpg', mimeType: 'image/jpeg', buffer: await photo('2026-10-03T21:00:00', '+07:00', '#cdf') },
		{ name: 'c.jpg', mimeType: 'image/jpeg', buffer: await photo(null) },
	])
	await page.waitForSelector('.taken')
	await expect(page.locator('.taken-title')).toHaveText('Photos prises à des dates différentes')
	await expect(page.locator('.taken-list li')).toHaveCount(3)
	await page.waitForTimeout(700)
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/02-confirmation-plusieurs-jours.png` })
	await page.getByRole('button', { name: /^Oui, / }).click()
	await expect.poll(() => [...puts].sort()).toEqual(['2026/10/02/a.jpg', '2026/10/03/b.jpg', '2026/11/20/c.jpg'])
})

test('sans EXIF : comportement actuel, aucune question, envoi direct à la date choisie', async ({ page }) => {
	const { puts, media } = await setup(page)
	await openSheetAndPick(page, [{ name: 'IMG_4.jpg', mimeType: 'image/jpeg', buffer: await photo(null) }])
	await expect.poll(() => puts).toEqual(['2026/11/20/IMG_4.jpg'])
	await expect(page.locator('.taken')).toHaveCount(0)
	await expect.poll(() => media.length).toBe(1)
	expect(media[0].items[0]).toEqual({ path: '2026/11/20/IMG_4.jpg', size: expect.any(Number) })
})

test('l\'index EXIF en échec ne casse pas l\'envoi', async ({ page }) => {
	const { puts } = await setup(page)
	await page.route('**/api/coffre/media', (r) => r.fulfill({ status: 503, contentType: 'application/json', body: '{"ok":false}' }))
	await openSheetAndPick(page, [{ name: 'IMG_5.jpg', mimeType: 'image/jpeg', buffer: await photo(null) }])
	await expect.poll(() => puts).toEqual(['2026/11/20/IMG_5.jpg'])
	await expect(page.locator('.fab')).toBeVisible()
})

for (const n of [4, 6]) {
	test(`${n} dates : la liste défile, les boutons gardent leur hauteur et restent dans l'écran`, async ({ page }) => {
		await setup(page)
		const colors = ['#fcd', '#cdf', '#dfc', '#fdc', '#cff', '#ffc']
		const files = await Promise.all(Array.from({ length: n }, async (_, i) => ({ name: `p${i}.jpg`, mimeType: 'image/jpeg', buffer: await photo(`2026-10-0${i + 1}T10:00:00`, '+07:00', colors[i]) })))
		if (n === 6) files.push({ name: 'clip.mp4', mimeType: 'video/mp4', buffer: Buffer.from('fake-video') })
		await openSheetAndPick(page, files)
		await page.waitForSelector('.taken')
		await page.waitForTimeout(700)
		const m = await page.evaluate(() => {
			const h = (s: string) => document.querySelector<HTMLElement>(s)!.getBoundingClientRect()
			const list = document.querySelector<HTMLElement>('.taken-list')!
			return { confirm: h('.sheet .btn-confirm:not(:has(.kh:empty))').height, keep: h('.btn-keep').height, cancelBottom: h('.sheet .btn-cancel').bottom, vh: innerHeight, scrolls: list.scrollHeight > list.clientHeight, sheetScrolls: (() => { const sh = document.querySelector<HTMLElement>('.sheet:has(.taken)')!; return sh.scrollHeight > sh.clientHeight + 1 })(), listH: list.clientHeight }
		})
		expect(m.sheetScrolls, 'la feuille ne doit pas défiler : les boutons restent visibles').toBe(false)
		expect(m.keep).toBeGreaterThanOrEqual(44)
		expect(m.cancelBottom).toBeLessThanOrEqual(m.vh)
		expect(m.listH).toBeLessThanOrEqual(0.34 * 852 + 1)
		if (n === 6) expect(m.scrolls).toBe(true)
		if (n === 4) expect(m.scrolls).toBe(false) // 4 dates tiennent sans défiler
		// vidéo comptée à part, jamais « 1 photo »
		if (SHOTS) await page.screenshot({ path: `${SHOTS}/03-confirmation-${n}-dates.png` })
		if (n === 6) {
			const last = page.locator('.taken-list li', { hasText: '20 novembre 2026' })
			await last.scrollIntoViewIfNeeded()
			await expect(last).toContainText('1 vidéo')
			await expect(last).not.toContainText('photo')
			if (SHOTS) await page.screenshot({ path: `${SHOTS}/03b-confirmation-6-dates-defile-video.png` })
		}
	})
}
