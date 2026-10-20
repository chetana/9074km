import { test, expect, type Page } from '@playwright/test'
import sharp from 'sharp'
import { injectExif } from '../src/lib/exif'

// Lot 2 : « Cet envoi : évènement » dans le sheet d'upload + compteur « à classer », API simulées
// (S3, /api/coffre/*, __data.json interceptés : rien de réel touché). Viewport iPhone 14 Pro posé explicitement.
test.describe.configure({ mode: 'serial' })
test.use({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
const SHOTS = process.env.SHOTS_DIR
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#fcd"/></svg>'

const ev = (id: number, fr: string, kh: string, start: string, end: string, o: Record<string, unknown> = {}) => ({
	id, names: { fr, en: fr, kh }, nameSrcLang: 'fr', namesPending: false, dates: { start, end }, cover: null, place: null,
	emoji: '🚆', color: 'peach', autoAttach: true, version: 1, count: 2, upcoming: false, ...o,
})
const LYON = ev(2, 'Week-end à Lyon', 'ចុងសប្តាហ៍នៅលីយ៉ុង', '2026-10-10', '2026-10-12')
const BIRTH = ev(6, 'Anniversaire de Lys', 'ថ្ងៃកំណើតលីស', '2026-10-02', '2026-10-02', { emoji: '🎂', color: 'gold' })
const MANUAL = ev(7, 'Marché du dimanche', 'ផ្សារថ្ងៃអាទិត្យ', '2026-10-11', '2026-10-11', { emoji: '🧺', autoAttach: false })
const ALL = [LYON, BIRTH, MANUAL]
const covering = (d: string) => ALL.filter((e) => e.dates.start <= d && e.dates.end >= d).sort((a, b) => Number(b.autoAttach) - Number(a.autoAttach))

async function photo(takenAt: string | null, color = '#fcd'): Promise<Buffer> {
	const base = await sharp({ create: { width: 120, height: 90, channels: 3, background: color } }).jpeg().toBuffer()
	return takenAt ? Buffer.from(injectExif(new Uint8Array(base), { takenAt, offset: '+07:00', lat: null, lng: null, make: 'Apple', model: 'iPhone', orientation: 1 })) : base
}

interface Opts { attachStatus?: () => number; unclassified?: number; failPut?: string }
async function setup(page: Page, o: Opts = {}) {
	const puts: string[] = []
	const media: any[] = []
	const attach: { id: number; paths: string[]; status: number }[] = []
	const created: any[] = []
	const json = (r: any, b: unknown, s = 200) => r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b) })
	await page.route('**/api/auth/sign-in', (r) => r.fulfill({ status: 200, body: 'sign-in (simulé)' }))
	await page.route(/__data\.json/, (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ type: 'data', nodes: [{ type: 'data', data: [{ user: 1 }, { id: 2, email: 3, name: 4, picture: 5 }, 2, 'c@x.fr', 'Chet', ''], uses: {} }, { type: 'skip' }] }) }))
	await page.route('**/api/version', (r) => json(r, { version: '1.0.333' }))
	await page.route('**/api/coffre/og-image*', (r) => r.fulfill({ contentType: 'image/svg+xml', body: SVG }))
	await page.route('**/api/coffre/sign-download*', (r) => json(r, { url: 'data:image/svg+xml;base64,' + Buffer.from(SVG).toString('base64') }))
	await page.route('**/api/coffre/cover*', (r) => json(r, { cover: null }))
	await page.route('**/api/coffre/list*', (r) => json(r, { prefixes: [], items: [] }))
	await page.route(/\/api\/coffre\/(note|meta|reactions)/, (r) => (r.request().url().includes('note') ? r.fulfill({ body: '' }) : json(r, {})))
	await page.route('**/api/coffre/events/for-date*', (r) => json(r, { events: covering(new URL(r.request().url()).searchParams.get('d')!), tags: {}, tagEvents: [] }))
	await page.route(/\/api\/coffre\/events\/\d+\/media/, (r) => {
		if (r.request().method() !== 'POST') return json(r, { paths: [] })
		const id = Number(/events\/(\d+)\/media/.exec(r.request().url())![1])
		const status = o.attachStatus?.() ?? 200
		attach.push({ id, paths: JSON.parse(r.request().postData()!).paths, status })
		return json(r, { success: status === 200 }, status)
	})
	await page.route(/\/api\/coffre\/events(\?.*)?$/, (r) => {
		if (r.request().method() === 'POST') { const b = JSON.parse(r.request().postData()!); const e = ev(99, b.name, b.name, b.dateStart, b.dateEnd, { emoji: null, count: 0 }); created.push(b); return json(r, { event: e }, 201) }
		return json(r, { events: ALL })
	})
	await page.route('**/api/coffre/media/unclassified*', (r) => json(r, { total: o.unclassified ?? 0, items: Array.from({ length: Math.min(o.unclassified ?? 0, 6) }, (_, i) => ({ path: `2026/10/${String(11 - (i >> 1)).padStart(2, '0')}/p${i}.jpg`, day: `2026-10-${String(11 - (i >> 1)).padStart(2, '0')}`, kind: i === 5 ? 'video' : 'image', size: 1 })), nextCursor: null }))
	await page.route('**/api/coffre/sign-upload', (r) => json(r, { url: `https://s3.test/${JSON.parse(r.request().postData()!).path}` }))
	await page.route('https://s3.test/**', (r) => { const k = decodeURIComponent(new URL(r.request().url()).pathname.slice(1)); if (o.failPut && k.includes(o.failPut)) return r.fulfill({ status: 500, body: '' }); puts.push(k); return r.fulfill({ status: 200, body: '' }) })
	await page.route('**/api/coffre/media', (r) => { media.push(JSON.parse(r.request().postData()!)); return json(r, { ok: true, recorded: 1 }) })
	return { puts, media, attach, created }
}

async function openSheet(page: Page, date: string) {
	await page.goto('/coffre')
	await page.waitForSelector('.fab')
	await page.locator('.fab').click()
	await page.waitForSelector('.date-input')
	await page.locator('.date-input').fill(date)
	await page.waitForTimeout(450) // anti-rebond + réponse for-date
}
async function pick(page: Page, files: { name: string; mimeType: string; buffer: Buffer }[]) {
	const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: /Choisir des photos/ }).click()])
	await chooser.setFiles(files)
}
const jpg = async (name: string, takenAt: string | null = null, color?: string) => ({ name, mimeType: 'image/jpeg', buffer: await photo(takenAt, color) })

test('évènement couvrant PRÉ-SÉLECTIONNÉ (auto_attach d\'abord) ; rattachement APRÈS l\'upload avec les chemins réellement envoyés', async ({ page }) => {
	const { puts, attach } = await setup(page)
	await openSheet(page, '2026-10-11')
	await expect(page.locator('.evt-btn')).toContainText('Week-end à Lyon') // MANUAL couvre aussi le 11 mais sans « ajouter ici »
	for (const sel of ['.evt-label span', '.evt-btn']) expect(await page.locator(sel).first().evaluate((e) => parseFloat(getComputedStyle(e).fontSize)), sel).toBeGreaterThanOrEqual(16)
	await page.waitForTimeout(300)
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/01-evenement-preselectionne.png` })
	await page.locator('.evt-btn').click()
	await expect(page.locator('.evt-list [role=option]').first()).toContainText('Aucun évènement')
	await expect(page.locator('.evt-list .on')).toContainText('Week-end à Lyon')
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/02-liste-evenements.png` })
	await page.locator('.evt-list .on').click()
	await pick(page, [await jpg('a.jpg')])
	await expect.poll(() => puts).toEqual(['2026/10/11/a.jpg'])
	await expect.poll(() => attach).toEqual([{ id: 2, paths: ['2026/10/11/a.jpg'], status: 200 }])
})

test('décocher : « Aucun évènement » → rien n\'est rattaché', async ({ page }) => {
	const { puts, attach } = await setup(page)
	await openSheet(page, '2026-10-11')
	await page.locator('.evt-btn').click()
	await page.locator('.evt-list [role=option]').first().click()
	await expect(page.locator('.evt-btn')).toContainText('Aucun évènement')
	await pick(page, [await jpg('b.jpg')])
	await expect.poll(() => puts).toEqual(['2026/10/11/b.jpg'])
	await page.waitForTimeout(600)
	expect(attach).toEqual([])
})

test('date sans évènement couvrant : « Aucun », aucun rattachement ; changer de date re-propose', async ({ page }) => {
	const { attach } = await setup(page)
	await openSheet(page, '2026-12-25')
	await expect(page.locator('.evt-btn')).toContainText('Aucun évènement')
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/03-aucun-evenement.png` })
	await page.locator('.date-input').fill('2026-10-02')
	await expect(page.locator('.evt-btn')).toContainText('Anniversaire de Lys')
	await page.locator('.date-input').fill('2026-12-25')
	await expect(page.locator('.evt-btn')).toContainText('Aucun évènement')
	expect(attach).toEqual([])
})

test('plusieurs dates : chaque lot est rattaché à l\'évènement qui couvre SA date (ou aucun)', async ({ page }) => {
	const { puts, attach } = await setup(page)
	await openSheet(page, '2026-10-11')
	await pick(page, [await jpg('a.jpg', '2026-10-02T09:00:00'), await jpg('b.jpg', '2026-10-03T09:00:00', '#cdf'), await jpg('c.jpg')])
	await page.waitForSelector('.taken')
	await page.waitForTimeout(700)
	await expect(page.locator('.row-evt')).toHaveCount(2) // la ligne du 3 oct. n'a aucun évènement couvrant : pas de puce
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/04-plusieurs-dates-evenements.png` })
	await page.getByRole('button', { name: /^Oui, / }).click()
	await expect.poll(() => [...puts].sort()).toEqual(['2026/10/02/a.jpg', '2026/10/03/b.jpg', '2026/10/11/c.jpg'])
	await expect.poll(() => attach.length).toBe(2)
	expect([...attach].sort((x, y) => x.id - y.id)).toEqual([
		{ id: 2, paths: ['2026/10/11/c.jpg'], status: 200 }, // date choisie : choix explicite (pré-sélection)
		{ id: 6, paths: ['2026/10/02/a.jpg'], status: 200 }, // 2 oct. : anniversaire ; 3 oct. : aucun évènement → aucun lien
	])
})

test('plusieurs dates : on peut retirer l\'évènement d\'un lot avant d\'envoyer', async ({ page }) => {
	const { puts, attach } = await setup(page)
	await openSheet(page, '2026-10-11')
	await pick(page, [await jpg('a.jpg', '2026-10-02T09:00:00'), await jpg('c.jpg')])
	await page.waitForSelector('.taken')
	await page.locator('.row-evt', { hasText: 'Anniversaire' }).click()
	await expect(page.locator('.taken-list li', { hasText: '2 octobre' }).locator('.row-evt')).toContainText('Sans évènement')
	await page.getByRole('button', { name: /^Oui, / }).click()
	await expect.poll(() => puts.length).toBe(2)
	await expect.poll(() => attach).toEqual([{ id: 2, paths: ['2026/10/11/c.jpg'], status: 200 }])
})

test('upload partiellement échoué : seul ce qui est parti est rattaché (jamais de lien fantôme)', async ({ page }) => {
	const { puts, attach, media } = await setup(page, { failPut: 'bad' })
	await openSheet(page, '2026-10-11')
	await pick(page, [await jpg('good.jpg'), await jpg('bad.jpg', null, '#cdf')])
	await expect.poll(() => puts).toEqual(['2026/10/11/good.jpg'])
	await expect.poll(() => attach).toEqual([{ id: 2, paths: ['2026/10/11/good.jpg'], status: 200 }])
	await expect.poll(() => media.length).toBe(1)
	expect(media[0].items.map((i: any) => i.path)).toEqual(['2026/10/11/good.jpg'])
})

test('échec du rattachement : toast non bloquant « Photos envoyées, évènement non attaché » + Réessayer', async ({ page }) => {
	let n = 0
	const { puts, attach } = await setup(page, { attachStatus: () => (n++ === 0 ? 500 : 200) })
	await openSheet(page, '2026-10-11')
	await pick(page, [await jpg('a.jpg')])
	await expect.poll(() => puts).toEqual(['2026/10/11/a.jpg'])
	const toast = page.locator('.toast', { hasText: 'évènement non attaché' })
	await expect(toast).toBeVisible()
	await page.waitForTimeout(500)
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/05-echec-rattachement.png` })
	expect(await toast.locator('.act .kh').evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(18)
	await toast.locator('.act').click()
	await expect.poll(() => attach.map((a) => a.status)).toEqual([500, 200])
	expect(attach[1].paths).toEqual(['2026/10/11/a.jpg'])
	await expect(page.locator('.toast', { hasText: 'ajoutées à l’évènement' })).toBeVisible()
})

test('création rapide « + Nouvel évènement » : la fiche s\'ouvre, l\'évènement créé est sélectionné et reçoit les photos', async ({ page }) => {
	const { attach, created } = await setup(page)
	await openSheet(page, '2026-12-25')
	await page.locator('.evt-btn').click()
	await page.locator('.evt-new').click()
	await page.waitForSelector('.form')
	await page.fill('.name-input', 'Noël')
	await page.getByRole('button', { name: /Enregistrer/ }).click()
	await expect(page.locator('.evt-btn')).toContainText('Noël')
	expect(created[0]).toMatchObject({ name: 'Noël', dateStart: '2026-12-25', dateEnd: '2026-12-25' })
	await pick(page, [await jpg('n.jpg')])
	await expect.poll(() => attach).toEqual([{ id: 99, paths: ['2026/12/25/n.jpg'], status: 200 }])
})

test('vidéo et photo sans EXIF : indexées dans media (kind déduit côté serveur, taille envoyée)', async ({ page }) => {
	const { media } = await setup(page)
	await openSheet(page, '2026-12-25')
	await pick(page, [await jpg('p.jpg'), { name: 'clip.mp4', mimeType: 'video/mp4', buffer: Buffer.from('fake-video') }])
	await expect.poll(() => media.length).toBe(1)
	const items = media[0].items
	expect(items.map((i: any) => i.path).sort()).toEqual(['2026/12/25/clip.mp4', '2026/12/25/p.jpg'])
	for (const i of items) expect(Object.keys(i).sort()).toEqual(['path', 'size'])
})

test('chip « N à classer » dans la vue Évènements : visible, ouvre la liste simple ; masqué à 0', async ({ page }) => {
	await setup(page, { unclassified: 12 })
	await page.goto('/coffre?v=events')
	const chip = page.locator('.todo')
	await expect(chip).toContainText('12 à classer')
	expect(await chip.locator('.kh').evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(18)
	await page.waitForTimeout(400)
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/06-chip-a-classer.png` })
	await chip.click()
	await page.waitForSelector('.thumbs')
	await page.waitForTimeout(800)
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/07-liste-a-classer.png` })
	await page.locator('.see').first().click()
	await expect(page).toHaveURL(/\/coffre/)
	await expect(page.locator('.day-files, .grid').first()).toBeVisible()
})

test('chip masqué quand tout est classé', async ({ page }) => {
	await setup(page, { unclassified: 0 })
	await page.goto('/coffre?v=events')
	await page.waitForSelector('.card')
	await expect(page.locator('.todo')).toHaveCount(0)
})
