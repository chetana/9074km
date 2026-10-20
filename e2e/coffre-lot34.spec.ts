import { test, expect, type Page } from '@playwright/test'

// Lots 3 et 4 : suggestions, mode tri (swipe simulé), export, couverture, retraduction, recherche. API simulées
// (S3, /api/coffre/*, __data.json interceptés : rien de réel touché). Viewport iPhone 14 Pro posé explicitement.
test.describe.configure({ mode: 'serial' })
test.use({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
const SHOTS = process.env.SHOTS_DIR
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fbc"/><stop offset="1" stop-color="#cdf"/></linearGradient></defs><rect width="400" height="400" fill="url(#g)"/><circle cx="140" cy="150" r="60" fill="#fff8"/></svg>'

const ev = (id: number, fr: string, kh: string, start: string, end: string, o: Record<string, unknown> = {}) => ({
	id, names: { fr, en: fr, kh }, nameSrcLang: 'fr', namesPending: false, dates: { start, end }, cover: null, place: null,
	emoji: '🚆', color: 'peach', autoAttach: true, version: 1, count: 3, upcoming: false, ...o,
})
const LYON = ev(2, 'Week-end à Lyon', 'ចុងសប្តាហ៍នៅលីយ៉ុង', '2026-10-10', '2026-10-12', { place: 'Lyon' })
const BIRTH = ev(6, 'Anniversaire de Lys', 'ថ្ងៃកំណើតលីស', '2026-09-05', '2026-09-05', { emoji: '🎂', color: 'gold', place: 'Phnom Penh' })
const NOEL = ev(8, 'Noël à Paris', 'បុណ្យណូអែល', '2025-12-24', '2025-12-26', { emoji: '🎄', color: 'mint', place: 'Paris', namesPending: true })
const ALL = [LYON, BIRTH, NOEL]
const days = (d: string, n: number) => Array.from({ length: n }, (_, i) => `${d.replaceAll('-', '/')}/p${String(i).padStart(2, '0')}.jpg`)

interface Opts { suggestions?: any[]; unclassified?: any[]; exportStatus?: number; patchTranslation?: string; mediaPaths?: string[]; attachSkip?: boolean }
async function setup(page: Page, o: Opts = {}) {
	const calls: { m: string; url: string; body: any }[] = []
	const json = (r: any, b: unknown, s = 200) => r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b) })
	const rec = (r: any) => { const p = r.request().postData(); calls.push({ m: r.request().method(), url: new URL(r.request().url()).pathname, body: p ? JSON.parse(p) : null }) }
	await page.route('**/api/auth/sign-in', (r) => r.fulfill({ status: 200, body: 'sign-in (simulé)' }))
	await page.route(/__data\.json/, (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ type: 'data', nodes: [{ type: 'data', data: [{ user: 1 }, { id: 2, email: 3, name: 4, picture: 5 }, 2, 'c@x.fr', 'Chet', ''], uses: {} }, { type: 'skip' }] }) }))
	await page.route('**/api/version', (r) => json(r, { version: '1.0.333' }))
	await page.route('**/api/coffre/og-image*', (r) => r.fulfill({ contentType: 'image/svg+xml', body: SVG }))
	await page.route('**/api/coffre/sign-download*', (r) => json(r, { url: 'data:image/svg+xml;base64,' + Buffer.from(SVG).toString('base64') }))
	await page.route('**/api/coffre/cover*', (r) => json(r, { cover: null }))
	await page.route('**/api/coffre/list*', (r) => json(r, { prefixes: [], items: [] }))
	await page.route(/\/api\/coffre\/(note|meta|reactions)/, (r) => (r.request().url().includes('note') ? r.fulfill({ body: '' }) : json(r, {})))
	await page.route('**/api/coffre/events/for-date*', (r) => { const d = new URL(r.request().url()).searchParams.get('d')!; json(r, { events: ALL.filter((e) => e.dates.start <= d && e.dates.end >= d), tags: {}, tagEvents: [] }) })
	await page.route('**/api/coffre/events/suggestions/dismiss', (r) => { rec(r); json(r, { success: true }) })
	await page.route('**/api/coffre/events/suggestions', (r) => json(r, { suggestions: calls.some((c) => c.url.endsWith('/dismiss') || (c.url.endsWith('/media') && c.m === 'POST')) ? [] : (o.suggestions ?? []) }))
	await page.route('**/api/coffre/events/export', (r) => { rec(r); if (o.exportStatus && o.exportStatus !== 200) return r.fulfill({ status: o.exportStatus, body: 'x' }); return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-disposition': 'attachment; filename="evenements-coffre-2026-10-20.json"' }, body: JSON.stringify({ format: 'coffre-evenements', formatVersion: 1, count: 3, events: ALL.map((e) => ({ id: e.id, names: e.names, photos: [] })) }) }) })
	await page.route(/\/api\/coffre\/events\/\d+\/media/, (r) => {
		rec(r)
		if (r.request().method() === 'GET') return json(r, { paths: o.mediaPaths ?? ['2026/10/11/a.jpg', '2026/10/11/b.jpg', '2026/10/12/clip.mp4'] })
		const b = JSON.parse(r.request().postData() ?? '{}')
		if (r.request().method() === 'POST' && o.attachSkip) return json(r, { success: true, added: 0, skipped: (b.paths ?? []).slice(0, 1).map((path: string) => ({ path, eventId: 6 })) })
		return json(r, { success: true, added: (b.paths ?? []).length, skipped: [] })
	})
	await page.route(/\/api\/coffre\/events\/\d+$/, (r) => {
		rec(r)
		const id = Number(/events\/(\d+)$/.exec(r.request().url())![1])
		if (r.request().method() === 'DELETE') return json(r, { success: true })
		const b = JSON.parse(r.request().postData() ?? '{}')
		const base = ALL.find((e) => e.id === id)!
		return json(r, { event: { ...base, version: base.version + 1, cover: b.coverPath ?? base.cover }, translation: o.patchTranslation })
	})
	await page.route(/\/api\/coffre\/events(\?.*)?$/, (r) => { if (r.request().method() === 'POST') { rec(r); const b = JSON.parse(r.request().postData()!); return json(r, { event: ev(99, b.name, b.name, b.dateStart, b.dateEnd, { emoji: null, count: 0 }), translation: 'scheduled' }, 201) } return json(r, { events: ALL }) })
	await page.route('**/api/coffre/media/unclassified*', (r) => { const items = o.unclassified ?? []; json(r, { total: items.length, items, nextCursor: null }) })
	await page.route('**/api/coffre/media/skip', (r) => { rec(r); json(r, { success: true, updated: 1 }) })
	return { calls }
}

const u = (path: string, day: string, kind = 'image', by: string | null = 'Chet') => ({ path, day, kind, size: 1, uploadedBy: by })
const SUGG_CREATE = { id: '2026-11-30_2026-11-30', start: '2026-11-30', end: '2026-11-30', days: 1, count: 38, kind: 'create', eventId: null, proposedName: '30 novembre', paths: days('2026-11-30', 38) }
const SUGG_ATTACH = { id: '2026-10-11_2026-10-11', start: '2026-10-11', end: '2026-10-11', days: 1, count: 12, kind: 'attach', eventId: 2, proposedName: '11 octobre', paths: days('2026-10-11', 12) }
const fs = (page: Page, sel: string) => page.locator(sel).first().evaluate((e) => parseFloat(getComputedStyle(e).fontSize))
const khmerSizes = (page: Page, root: string) => page.evaluate((r) => {
	const out: { text: string; size: number }[] = []
	for (const el of document.querySelectorAll<HTMLElement>(`${r} *`)) {
		const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent ?? '').join('')
		if (/[ក-៿]/.test(own) && el.getClientRects().length) out.push({ text: own.trim().slice(0, 24), size: parseFloat(getComputedStyle(el).fontSize) })
	}
	return out
}, root)

test('carte de suggestion (jour isolé) : texte FR + khmer, Oui → confirmation avec le nombre de photos → création + rattachement en mode keep', async ({ page }) => {
	const { calls } = await setup(page, { suggestions: [SUGG_CREATE], unclassified: [u('2026/11/30/p00.jpg', '2026-11-30')] })
	await page.goto('/coffre?v=events')
	const card = page.locator('section.card')
	await expect(card).toContainText('38 photos du 30 novembre 2026 sans évènement')
	await expect(card).toContainText('Nouvel évènement « 30 novembre » ?')
	const kh = await khmerSizes(page, 'section.card')
	expect(kh.filter((x) => x.size < 16), JSON.stringify(kh)).toEqual([])
	for (const sel of ['section.card .yes .kh', 'section.card .other .kh', 'section.card .q']) expect(await fs(page, sel), sel).toBeGreaterThanOrEqual(16)
	await page.waitForTimeout(400)
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/01-carte-suggestion.png` })
	await card.getByRole('button', { name: /^Oui/ }).click()
	await expect(page.locator('.confirm .cq')).toContainText('Créer « 30 novembre » avec 38 photos ?')
	await page.waitForTimeout(500)
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/02-confirmation-suggestion.png` })
	expect(calls.filter((c) => c.m === 'POST')).toEqual([]) // rien n'est écrit avant la confirmation
	await page.locator('.confirm .go').click()
	await expect.poll(() => calls.filter((c) => c.m === 'POST').length).toBe(2)
	const posts = calls.filter((c) => c.m === 'POST')
	expect(posts[0]).toMatchObject({ url: '/api/coffre/events', body: { name: '30 novembre', dateStart: '2026-11-30', dateEnd: '2026-11-30' } })
	expect(posts[1].url).toBe('/api/coffre/events/99/media')
	expect(posts[1].body.mode).toBe('keep')
	expect(posts[1].body.paths).toHaveLength(38)
	await expect(page.locator('.toast', { hasText: '38 photos ajoutées' })).toBeVisible()
	await expect(page.locator('section.card')).toHaveCount(0)
})

test('suggestion « ajouter à » un évènement existant ; photo déjà ailleurs : jamais déplacée en silence', async ({ page }) => {
	const { calls } = await setup(page, { suggestions: [SUGG_ATTACH], attachSkip: true })
	await page.goto('/coffre?v=events')
	await expect(page.locator('section.card .q')).toContainText('Ajouter à « Week-end à Lyon » ?')
	await page.locator('section.card').getByRole('button', { name: /^Oui/ }).click()
	await expect(page.locator('.confirm .cq')).toContainText('Ajouter 12 photos à « Week-end à Lyon » ?')
	await page.locator('.confirm .go').click()
	await expect(page.locator('.toast', { hasText: 'Déjà dans « Anniversaire de Lys »' })).toBeVisible()
	const media = calls.filter((c) => c.m === 'POST' && c.url.endsWith('/media'))
	expect(media).toHaveLength(1)
	expect(media[0].body.mode).toBe('keep')
})

test('« Autre… » : choisir un autre évènement puis confirmer ; × : refus enregistré avec la plage et le nombre de photos', async ({ page }) => {
	const { calls } = await setup(page, { suggestions: [SUGG_CREATE] })
	await page.goto('/coffre?v=events')
	await page.locator('section.card').getByRole('button', { name: /^Autre/ }).click()
	await page.locator('.sheet .row', { hasText: 'Anniversaire de Lys' }).click()
	await expect(page.locator('.confirm .cq')).toContainText('Ajouter 38 photos à « Anniversaire de Lys » ?')
	await page.locator('.confirm .no').click()
	await page.locator('section.card .x').click()
	await expect.poll(() => calls.find((c) => c.url.endsWith('/dismiss'))?.body).toEqual({ start: '2026-11-30', end: '2026-11-30', count: 38 })
	await expect(page.locator('section.card')).toHaveCount(0)
})

test('mode tri : ordre (jour le plus fourni d\'abord), compteur, rangement, Passer, swipe ←/→ avec étiquette, annulation 5 s', async ({ page }) => {
	const unclassified = [u('2026/10/11/a.jpg', '2026-10-11'), u('2026/10/11/b.jpg', '2026-10-11'), u('2026/10/11/c.jpg', '2026-10-11', 'image', 'Lys'), u('2026/09/01/z.jpg', '2026-09-01'), u('2026/09/01/v.mp4', '2026-09-01', 'video')]
	const { calls } = await setup(page, { unclassified })
	await page.goto('/coffre?v=events')
	await page.locator('.todo').click()
	await page.waitForSelector('.sort .photo')
	await expect(page.locator('.sort .count-n')).toHaveText('5 / 5 restantes')
	await expect(page.locator('.sort .date')).toContainText('dimanche 11 octobre 2026') // 3 photos > 2 photos
	await expect(page.locator('.sort .by')).toContainText('Envoyée par Chet')
	const kh = await khmerSizes(page, '.sort')
	expect(kh.filter((x) => x.size < 16), JSON.stringify(kh)).toEqual([])
	for (const sel of ['.sort .skip .kh', '.sort .chip.new span[lang=km]']) expect(await fs(page, sel), sel).toBeGreaterThanOrEqual(18)
	for (const sel of ['.sort .skip', '.sort .chip', '.sort .round']) expect((await page.locator(sel).first().boundingBox())!.height, sel).toBeGreaterThanOrEqual(44)
	expect(await page.locator('.sort video').count()).toBe(0)
	await page.waitForTimeout(500)
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/03-mode-tri.png` })
	// 1. ranger dans l'évènement qui couvre la date (chip fort), en mode keep
	await page.locator('.sort .chip.strong').first().click()
	await expect(page.locator('.sort .count-n')).toHaveText('4 / 5 restantes')
	expect(calls.find((c) => c.url === '/api/coffre/events/2/media' && c.m === 'POST')?.body).toEqual({ paths: ['2026/10/11/a.jpg'], mode: 'keep' })
	// 2. swipe → : même choix que la précédente, étiquette visible PENDANT le geste
	const ph = page.locator('.sort .photo')
	const box = (await ph.boundingBox())!
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
	await page.mouse.down()
	await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, { steps: 4 })
	await expect(page.locator('.sort .hint.right')).toContainText('Comme la précédente : Week-end à Lyon')
	expect(Number(await page.locator('.sort .hint.right').evaluate((e) => getComputedStyle(e).opacity))).toBeGreaterThan(0.3)
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/04-swipe-droite.png` })
	await page.mouse.move(box.x + box.width / 2 + 150, box.y + box.height / 2, { steps: 4 })
	await page.mouse.up()
	await expect(page.locator('.sort .count-n')).toHaveText('3 / 5 restantes')
	expect(calls.filter((c) => c.url === '/api/coffre/events/2/media' && c.m === 'POST').map((c) => c.body.paths[0])).toEqual(['2026/10/11/a.jpg', '2026/10/11/b.jpg'])
	// 3. swipe ← : passer (skipped_at)
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
	await page.mouse.down()
	await page.mouse.move(box.x + box.width / 2 - 150, box.y + box.height / 2, { steps: 6 })
	await page.mouse.up()
	await expect(page.locator('.sort .count-n')).toHaveText('2 / 5 restantes')
	expect(calls.find((c) => c.url === '/api/coffre/media/skip')?.body).toEqual({ paths: ['2026/10/11/c.jpg'], undo: false })
	// 4. annuler le dernier choix (5 s) : le skip est défait et la photo revient
	await page.locator('.sort .undo').click()
	await expect(page.locator('.sort .count-n')).toHaveText('3 / 5 restantes')
	expect(calls.filter((c) => c.url === '/api/coffre/media/skip').at(-1)?.body).toEqual({ paths: ['2026/10/11/c.jpg'], undo: true })
	await expect(page.locator('.sort .by')).toContainText('Envoyée par Lys')
	// 5. Passer au bouton (c.jpg)
	await page.locator('.sort .skip').click()
	await expect(page.locator('.sort .count-n')).toHaveText('2 / 5 restantes')
	// 6. la photo suivante est la vidéo du 1er sept. (v.mp4 avant z.jpg) : vignette FIXE, aucune lecture
	await expect(page.locator('.sort .date')).toContainText('mardi 1 septembre 2026')
	await expect(page.locator('.sort .vph, .sort .vid')).toBeVisible()
	expect(await page.locator('.sort video').count()).toBe(0)
	await page.waitForTimeout(400)
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/05-mode-tri-video.png` })
	await page.locator('.sort .skip').click()
	await expect(page.locator('.sort .count-n')).toHaveText('1 / 5 restantes')
})

test('mode tri : swipe → sans choix précédent = message, rien d\'envoyé ; l\'annulation disparaît après 5 s', async ({ page }) => {
	const { calls } = await setup(page, { unclassified: [u('2026/10/11/a.jpg', '2026-10-11'), u('2026/10/11/b.jpg', '2026-10-11')] })
	await page.goto('/coffre?v=events')
	await page.locator('.todo').click()
	await page.waitForSelector('.sort .photo')
	const box = (await page.locator('.sort .photo').boundingBox())!
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
	await page.mouse.down()
	await page.mouse.move(box.x + box.width / 2 + 160, box.y + box.height / 2, { steps: 5 })
	await page.mouse.up()
	await expect(page.locator('.toast', { hasText: 'Pas encore de choix précédent' })).toBeVisible()
	expect(calls.filter((c) => c.m === 'POST')).toEqual([])
	await expect(page.locator('.sort .count-n')).toHaveText('2 / 2 restantes')
	await page.locator('.sort .skip').click()
	await expect(page.locator('.sort .undo')).toBeVisible()
	await page.waitForTimeout(5300)
	await expect(page.locator('.sort .undo')).toHaveCount(0)
})

test('mode tri : « + Nouveau » ouvre la fiche à la date de la photo, l\'évènement créé reçoit la photo', async ({ page }) => {
	const { calls } = await setup(page, { unclassified: [u('2026/12/25/a.jpg', '2026-12-25')] })
	await page.goto('/coffre?v=events')
	await page.locator('.todo').click()
	await page.waitForSelector('.sort .photo')
	await page.locator('.sort .chip.new').click()
	await page.waitForSelector('.form')
	await page.fill('.name-input', 'Noël')
	await page.getByRole('button', { name: /Enregistrer/ }).click()
	await expect(page.locator('.sort .done')).toBeVisible()
	expect(calls.find((c) => c.url === '/api/coffre/events' && c.m === 'POST')?.body).toMatchObject({ name: 'Noël', dateStart: '2026-12-25' })
	expect(calls.find((c) => c.url === '/api/coffre/events/99/media')?.body).toEqual({ paths: ['2026/12/25/a.jpg'], mode: 'keep' })
})

test('export : menu ⋯ → Exporter télécharge le JSON ; 429 → message clair', async ({ page }) => {
	await setup(page)
	await page.goto('/coffre?v=events')
	await page.waitForSelector('.card')
	await page.locator('.more-btn').click()
	if (SHOTS) { await page.waitForTimeout(500); await page.screenshot({ path: `${SHOTS}/06-menu-export.png` }) }
	const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Exporter/ }).click()])
	expect(dl.suggestedFilename()).toBe('evenements-coffre-2026-10-20.json')
	const body = JSON.parse(await (await import('node:fs/promises')).readFile((await dl.path())!, 'utf8'))
	expect(body).toMatchObject({ format: 'coffre-evenements', count: 3 })
})

test('export limité (429) : toast clair, pas de téléchargement', async ({ page }) => {
	await setup(page, { exportStatus: 429 })
	await page.goto('/coffre?v=events')
	await page.waitForSelector('.card')
	await page.locator('.more-btn').click()
	await page.getByRole('button', { name: /Exporter/ }).click()
	await expect(page.locator('.toast', { hasText: 'Trop d’exports' })).toBeVisible()
})

test('recherche locale par lieu et par date + chips de lieu', async ({ page }) => {
	await setup(page)
	await page.goto('/coffre?v=events')
	await page.waitForSelector('.card')
	const names = () => page.locator('.card .name').allInnerTexts()
	await page.fill('.search input', 'lyon')
	await expect.poll(names).toEqual(['Week-end à Lyon'])
	await page.fill('.search input', 'nov')
	await expect.poll(names).toEqual([]) // aucun évènement en novembre dans ces données
	await page.fill('.search input', 'déc')
	await expect.poll(names).toEqual(['Noël à Paris'])
	await page.fill('.search input', '11')
	await expect.poll(names).toEqual(['Week-end à Lyon'])
	await page.fill('.search input', '')
	await expect.poll(async () => (await names()).length).toBe(3)
	await page.locator('.chips[aria-label=Lieu] .chip', { hasText: 'Paris' }).click()
	await expect.poll(names).toEqual(['Noël à Paris'])
	await expect(page.locator('.pend-badge')).toContainText('Traduction…')
	if (SHOTS) { await page.waitForTimeout(400); await page.screenshot({ path: `${SHOTS}/07-recherche-lieux.png` }) }
})

test('couverture en un geste depuis le viewer ; une vidéo ne peut pas être couverture (message clair)', async ({ page }) => {
	const { calls } = await setup(page)
	await page.goto('/coffre?v=events&e=2')
	await page.waitForSelector('.cell img')
	await page.locator('.cell').first().locator('.tile').click()
	const star = page.locator('.viewer-backdrop .cover-btn')
	await expect(star).toBeVisible()
	await page.waitForTimeout(500) // fin de l'animation d'ouverture du viewer (scale)
	expect((await star.boundingBox())!.height).toBeGreaterThanOrEqual(44)
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/08-viewer-couverture.png` })
	await star.click()
	await expect.poll(() => calls.find((c) => c.m === 'PATCH')?.body).toEqual({ ifVersion: 1, coverPath: '2026/10/11/a.jpg' })
	await expect(page.locator('.toast', { hasText: 'Couverture mise à jour' })).toBeVisible()
	// vidéo : refus clair, aucun PATCH de plus
	const patches = calls.filter((c) => c.m === 'PATCH').length
	await page.evaluate(() => { document.querySelector<HTMLElement>('.viewer-backdrop .nav-next')?.click() })
	await page.evaluate(() => { document.querySelector<HTMLElement>('.viewer-backdrop .nav-next')?.click() })
	await star.click()
	await expect(page.locator('.toast', { hasText: 'Une vidéo ne peut pas être la couverture' })).toBeVisible()
	expect(calls.filter((c) => c.m === 'PATCH').length).toBe(patches)
})

test('couverture en sélection : 1 image OK ; 1 vidéo = message clair', async ({ page }) => {
	const { calls } = await setup(page)
	await page.goto('/coffre?v=events&e=2')
	await page.waitForSelector('.cell img')
	const press = async (i: number) => { const t = page.locator('.cell .tile').nth(i); await t.dispatchEvent('pointerdown'); await page.waitForTimeout(650); await t.dispatchEvent('pointerup') }
	await press(2) // vidéo
	await page.locator('.selbar .act', { hasText: 'Couverture' }).click()
	await expect(page.locator('.toast', { hasText: 'Une vidéo ne peut pas être la couverture' })).toBeVisible()
	expect(calls.filter((c) => c.m === 'PATCH')).toEqual([])
	await page.locator('.selbar .act.ghost').click()
	await press(1)
	await page.locator('.selbar .act', { hasText: 'Couverture' }).click()
	await expect.poll(() => calls.find((c) => c.m === 'PATCH')?.body).toEqual({ ifVersion: 1, coverPath: '2026/10/11/b.jpg' })
})

test('retraduire sur demande : PATCH name (langue source) ; limite atteinte = message ; édition manuelle sans retraduction', async ({ page }) => {
	const { calls } = await setup(page, { patchTranslation: 'limited' })
	await page.goto('/coffre?v=events&e=2')
	await page.waitForSelector('.hero-txt')
	await page.getByRole('button', { name: /Plus d/ }).click()
	await page.getByRole('button', { name: /^Modifier/ }).click()
	await page.waitForSelector('.form')
	await page.waitForTimeout(500)
	expect(await fs(page, '.retr .kh')).toBeGreaterThanOrEqual(18)
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/09-fiche-retraduire.png` })
	await page.getByRole('button', { name: /^Retraduire/ }).click()
	await expect.poll(() => calls.find((c) => c.m === 'PATCH')?.body).toEqual({ ifVersion: 1, name: 'Week-end à Lyon', nameLang: 'fr' })
	await expect(page.locator('.toast', { hasText: 'Limite de traductions atteinte' })).toBeVisible()
})

test('édition manuelle d\'une langue : names, jamais name (pas de retraduction automatique)', async ({ page }) => {
	const { calls } = await setup(page)
	await page.goto('/coffre?v=events&e=2')
	await page.waitForSelector('.hero-txt')
	await page.getByRole('button', { name: /Plus d/ }).click()
	await page.getByRole('button', { name: /^Modifier/ }).click()
	await page.waitForSelector('.form')
	await page.fill('input[aria-label="Nom en anglais"]', 'Lyon weekend')
	await page.getByRole('button', { name: /^Enregistrer/ }).click()
	await expect.poll(() => calls.find((c) => c.m === 'PATCH')?.body).toEqual({ ifVersion: 1, names: { en: 'Lyon weekend' } })
})

test('suppression : confirmation dans le menu, puis toast Annuler 5 s (requête envoyée à l\'expiration seulement)', async ({ page }) => {
	const { calls } = await setup(page)
	await page.goto('/coffre?v=events&e=2')
	await page.waitForSelector('.hero-txt')
	await page.getByRole('button', { name: /Plus d/ }).click()
	await page.getByRole('button', { name: /^Supprimer/ }).click()
	await expect(page.locator('.confirm')).toContainText('Supprimer cet évènement ?')
	await expect(page.locator('.confirm')).toContainText('Les photos restent dans le coffre')
	await page.waitForTimeout(500)
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/10-confirmation-suppression.png` })
	expect(calls.filter((c) => c.m === 'DELETE')).toEqual([])
	await page.locator('.confirm .mi', { hasText: 'Annuler' }).click() // la confirmation se referme, rien n'est parti
	await expect(page.locator('.confirm')).toHaveCount(0)
	await page.getByRole('button', { name: /^Supprimer/ }).click()
	await page.locator('.confirm .mi.solid').click()
	await expect(page.locator('.toast', { hasText: 'Évènement supprimé' })).toBeVisible()
	expect(calls.filter((c) => c.m === 'DELETE')).toEqual([]) // pas encore : 5 s pour annuler
	await page.waitForTimeout(5400)
	expect(calls.filter((c) => c.m === 'DELETE').map((c) => c.url)).toEqual(['/api/coffre/events/2'])
})

test('en-têtes de jour lisibles (FR + khmer, jour de la semaine) avec compteur par jour', async ({ page }) => {
	await setup(page)
	await page.goto('/coffre?v=events&e=2')
	await page.waitForSelector('.cell img')
	await expect(page.locator('.day').first()).toContainText('dimanche 11 octobre')
	await expect(page.locator('.day').first()).toContainText('អាទិត្យ 11 តុលា')
	await expect(page.locator('.day .n').first()).toHaveText('2')
	expect(await fs(page, '.day span[lang=km]')).toBeGreaterThanOrEqual(18)
})
