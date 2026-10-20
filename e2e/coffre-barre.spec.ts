import { test, expect, type Page } from '@playwright/test'
import { ev, mockCoffre } from './support/coffre-mocks'

// Barre de la vue Évènements : boutons Année/Lieu + fenêtres, bouton Suggestion + fenêtre, mémoire de position, hauteur gagnée.
test.use({ baseURL: 'http://localhost:5174', deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const SHOTS = process.env.SHOTS_DIR
const SIZES = [[393, 852], [375, 667]] as const

const PLACES = ['Lyon', 'Paris', 'Phnom Penh', 'Siem Reap', 'Marseille', 'Bordeaux', 'Kampot', 'Strasbourg', 'Koh Kong', 'Nice']
const EVENTS = [
	ev(1, 'Disneyland Paris', 'ឌីស្នីឡែន ប៉ារីស', '2026-11-30', '2026-11-30', { upcoming: true, place: 'Paris', count: 0, cover: '2026/10/11/p00.jpg' }),
	...Array.from({ length: 13 }, (_, i) => ev(10 + i, `Évènement ${i + 1}`, `ព្រឹត្តិការណ៍ ${i + 1}`, `${2026 - Math.floor(i / 5)}-0${1 + (i % 9)}-1${i % 9}`, `${2026 - Math.floor(i / 5)}-0${1 + (i % 9)}-1${i % 9}`, { place: PLACES[i % PLACES.length], cover: '2026/10/11/p01.jpg', count: 5 + i })),
]
const sugg = (n: number) => ({ id: `s${n}`, start: `2026-0${n}-20`, end: `2026-0${n}-20`, days: 1, count: 10 + n, kind: 'create', eventId: null, proposedName: `Jour ${n}`, paths: Array.from({ length: 10 + n }, (_, i) => `2026/0${n}/20/p${i}.jpg`) })

async function open(page: Page, w: number, h: number, o: { suggestions?: any[]; unclassified?: any[]; view?: 'album' | 'grid' | null; events?: any[] } = {}) {
	await page.setViewportSize({ width: w, height: h })
	const { calls } = await mockCoffre(page, { auth: 'real', view: o.view === undefined ? 'album' : o.view, events: o.events ?? EVENTS, suggestions: o.suggestions ?? [], unclassified: o.unclassified })
	await page.goto('/coffre?v=events')
	await page.waitForSelector(o.view === 'grid' ? '.card' : '.slot[data-center]')
	await page.waitForTimeout(400)
	return { calls }
}
const centerName = (page: Page) => page.locator('.slot[data-center] .t1').innerText()
const yearBtn = (page: Page) => page.locator('.fbtn').nth(0)
const placeBtn = (page: Page) => page.locator('.fbtn').nth(1)

for (const [w, h] of SIZES) {
	test(`boutons Année / Lieu : libellés, choix affiché, croix, fenêtre avec coche et comptes, re-toucher décoche : ${w}×${h}`, async ({ page }) => {
		await open(page, w, h)
		await expect(yearBtn(page)).toContainText('Toutes les années')
		await expect(placeBtn(page)).toContainText('Tous les lieux')
		for (const sel of ['.fbtn .fmain']) for (const l of await page.locator(sel).all()) expect((await l.boundingBox())!.height).toBeGreaterThanOrEqual(44)
		const cut = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.fbtn .ft > span, .fbtn .ft.one')].filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent))
		expect(cut, 'libellés des boutons non tronqués').toEqual([])
		expect(await page.locator('.fbtn .kh').first().evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(18)
		await yearBtn(page).locator('.fmain').click()
		const opts = page.getByRole('option')
		await expect(opts.first()).toBeVisible()
		const n26 = EVENTS.filter((e) => e.dates.start.startsWith('2026')).length
		await expect(page.getByRole('option', { name: /^2026/ })).toContainText(String(n26))
		await page.waitForTimeout(600)
		if (SHOTS) await page.screenshot({ path: `${SHOTS}/barre-fenetre-annee-${w}x${h}.png` })
		await page.getByRole('option', { name: /^2026/ }).click()
		await expect(page.locator('.sheet-grip')).toHaveCount(0) // un choix = la fenêtre se ferme
		await expect(yearBtn(page).locator('.ft')).toHaveText('2026')
		await expect(yearBtn(page)).toHaveClass(/on/)
		expect((await yearBtn(page).locator('.fx').boundingBox())!.width).toBeGreaterThanOrEqual(44)
		await placeBtn(page).locator('.fmain').click()
		const lyon26 = EVENTS.filter((e) => e.dates.start.startsWith('2026') && e.place === 'Lyon').length
		await expect(page.getByRole('option', { name: /^Lyon/ })).toContainText(String(lyon26)) // lieux comptés sur l'année choisie
		await page.getByRole('option', { name: /^Siem Reap/ }).click()
		await expect(placeBtn(page).locator('.ft')).toHaveText('Siem Reap')
		await expect(page.locator('.count')).toContainText(/sur 14/)
		await expect(page.locator('.sheet-overlay')).toHaveCount(0)
		// re-toucher le lieu coché l'enlève ; on le remet
		await placeBtn(page).locator('.fmain').click()
		await expect(page.getByRole('option', { name: /^Siem Reap/ })).toHaveAttribute('aria-selected', 'true')
		await page.getByRole('option', { name: /^Siem Reap/ }).click()
		await expect(placeBtn(page)).toContainText('Tous les lieux')
		await expect(page.locator('.sheet-overlay')).toHaveCount(0)
		await placeBtn(page).locator('.fmain').click(); await page.getByRole('option', { name: /^Siem Reap/ }).click()
		await expect(placeBtn(page).locator('.ft')).toHaveText('Siem Reap')
		await expect(page.locator('.sheet-overlay')).toHaveCount(0)
		// la coche : l'option active est cochée, re-toucher l'enlève
		await yearBtn(page).locator('.fmain').click()
		await expect(page.getByRole('option', { name: /^2026/ })).toHaveAttribute('aria-selected', 'true')
		await expect(page.getByRole('option', { name: /^2026/ }).locator('svg')).toHaveCount(1)
		await expect(page.getByRole('button', { name: /Tout effacer/ })).toBeVisible()
		await page.waitForTimeout(600)
		if (SHOTS) await page.screenshot({ path: `${SHOTS}/barre-fenetre-coche-${w}x${h}.png` })
		await page.getByRole('option', { name: /^2026/ }).click()
		await expect(page.locator('.sheet-overlay')).toHaveCount(0)
		await expect(yearBtn(page)).toContainText('Toutes les années')
		// la croix efface un filtre sans ouvrir la fenêtre
		await placeBtn(page).locator('.fx').click()
		await expect(placeBtn(page)).toContainText('Tous les lieux')
		await expect(page.getByRole('option')).toHaveCount(0)
		// « Tout effacer »
		await yearBtn(page).locator('.fmain').click(); await page.getByRole('option', { name: /^2025/ }).click()
		await expect(page.locator('.sheet-overlay')).toHaveCount(0)
		await placeBtn(page).locator('.fmain').click()
		await page.getByRole('button', { name: /Tout effacer/ }).click()
		await expect(yearBtn(page)).toContainText('Toutes les années')
		// aucune limite de 8 lieux, liste défilante
		await placeBtn(page).locator('.fmain').click()
		expect(await page.getByRole('option').count()).toBeGreaterThanOrEqual(9)
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(w)
	})
}

test('les filtres ne sont pas mémorisés d\'une ouverture à l\'autre', async ({ page }) => {
	await open(page, 393, 852)
	await yearBtn(page).locator('.fmain').click(); await page.getByRole('option', { name: /^2026/ }).click()
	await page.reload(); await page.waitForSelector('.slot[data-center]')
	await expect(yearBtn(page)).toContainText('Toutes les années')
})

test('bouton Suggestion : absent à 0 ; dans la barre du haut ; compteur ; fenêtre listant toutes les suggestions ; refus et Oui', async ({ page }) => {
	await open(page, 393, 852)
	await expect(page.locator('.sugg-btn')).toHaveCount(0)
	// 3 suggestions + chip « à classer »
	let list = [sugg(5), sugg(6), sugg(7)]
	const tri = [{ path: '2026/10/11/p10.jpg', day: '2026-10-11', kind: 'image', size: 1, uploadedBy: 'Chet' }]
	const { calls } = await open(page, 393, 852, { suggestions: list, unclassified: tri })
	await page.route('**/api/coffre/events/suggestions', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ suggestions: list }) }))
	const dismissed: string[] = []
	await page.route('**/api/coffre/events/suggestions/dismiss', (r) => { const b = JSON.parse(r.request().postData()!); dismissed.push(b.start); list = list.filter((s) => s.start !== b.start); r.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' }) })
	await page.reload(); await page.waitForSelector('.sugg-btn')
	const btn = page.locator('.sugg-btn')
	await expect(btn).toHaveAttribute('aria-label', /Suggestion · .* · 3$/)
	await expect(btn.locator('.sugg-n')).toHaveText('3')
	const bt = (await btn.boundingBox())!, hd = (await page.locator('header.header').boundingBox())!, av = (await page.locator('.header-actions').boundingBox())!
	expect(bt.y).toBeGreaterThanOrEqual(hd.y); expect(bt.y + bt.height).toBeLessThanOrEqual(hd.y + hd.height) // dans la barre : aucune hauteur prise ailleurs
	expect(bt.x + bt.width).toBeLessThanOrEqual(av.x) // à gauche de l'avatar, sans le recouvrir
	expect(bt.height).toBeGreaterThanOrEqual(44); expect(bt.width).toBeGreaterThanOrEqual(44)
	expect((await page.locator('.tools .sugg-btn').count())).toBe(0) // plus de bouton dans la liste
	expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(393)
	await btn.click()
	await expect(page.locator('section.card')).toHaveCount(3)
	await expect(page.locator('section.card').first()).toContainText('Nouvel évènement « Jour 5 » ?')
	await page.waitForTimeout(600)
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/barre-fenetre-suggestions.png` })
	// refus (×) : la liste se met à jour
	await page.locator('section.card').first().locator('.x').click()
	await expect(page.locator('section.card')).toHaveCount(2)
	await expect(btn.locator('.sugg-n')).toHaveText('2')
	expect(dismissed).toEqual(['2026-05-20'])
	// Oui : confirmation avec le nombre, POST seulement après confirmation
	await page.locator('section.card').first().getByRole('button', { name: /^Oui/ }).click()
	await expect(page.locator('.confirm .cq')).toContainText('avec 16 photos')
	expect(calls.filter((c) => c.m === 'POST' && !c.url.endsWith('/dismiss'))).toEqual([])
	await page.locator('.confirm .go').click()
	await expect.poll(() => calls.filter((c) => c.m === 'POST' && c.url.includes('/media')).length).toBe(1)
	// derniers refus : la fenêtre se ferme quand il n'en reste plus
	list = []
	await page.evaluate(() => 0)
})

test('hauteur : la scène gagne la place libérée, la carte grandit ; 375×667 : texte lisible dans la carte', async ({ page }) => {
	await open(page, 393, 852)
	const big = (await page.locator('.stage').boundingBox())!.height
	console.log('SCENE 393x852', big)
	expect(big).toBeGreaterThanOrEqual(295 + 90) // avant (puces) : 295 px sur ces données
	const card = (await page.locator('.slot[data-center] .album').boundingBox())!
	expect(card.height).toBeGreaterThanOrEqual(300)
	await page.setViewportSize({ width: 375, height: 667 })
	await page.goto('/coffre?v=events'); await page.waitForSelector('.slot[data-center]'); await page.waitForTimeout(500)
	const sz = await page.evaluate(() => { const f = (s: string) => parseFloat(getComputedStyle(document.querySelector(s)!).fontSize); return { t1: f('.slot[data-center] .t1'), t2: f('.slot[data-center] .t2'), meta: f('.slot[data-center] .meta'), stage: document.querySelector('.stage')!.getBoundingClientRect().height } })
	console.log('SE', JSON.stringify(sz))
	expect(sz.t1).toBeGreaterThanOrEqual(16); expect(sz.t2).toBeGreaterThanOrEqual(18); expect(sz.meta).toBeGreaterThanOrEqual(13)
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/barre-se-375x667.png` })
})

test('position mémorisée : retour d\'un évènement, rechargement ; filtre qui exclut le centre = date la plus proche, retiré = retour', async ({ page }) => {
	await open(page, 393, 852)
	await page.keyboard.press('Tab') // focus dans la page, puis flèches sur la carte centrale
	await page.locator('.slot[data-center] .album').focus()
	await page.keyboard.press('ArrowRight'); await page.waitForTimeout(250); await page.keyboard.press('ArrowRight')
	await page.waitForTimeout(600)
	const picked = await centerName(page)
	expect(picked).not.toBe('Disneyland Paris')
	await page.locator('.slot[data-center] .album').click()
	await expect(page.locator('.hero-txt')).toBeVisible()
	await page.goBack()
	await page.waitForSelector('.slot[data-center]'); await page.waitForTimeout(400)
	expect(await centerName(page)).toBe(picked) // retour d'un évènement
	await page.reload(); await page.waitForSelector('.slot[data-center]'); await page.waitForTimeout(400)
	expect(await centerName(page)).toBe(picked) // ouverture de l'app
	// filtre qui exclut l'évènement central : le plus proche en date
	const mem = EVENTS.find((e) => e.names.fr === picked)!
	const other = String(Number(mem.dates.start.slice(0, 4)) === 2026 ? 2025 : 2026)
	await yearBtn(page).locator('.fmain').click(); await page.getByRole('option', { name: new RegExp('^' + other) }).click()
	await page.waitForTimeout(300)
	const near = await centerName(page)
	const inYear = EVENTS.filter((e) => e.dates.start.startsWith(other))
	const expected = inYear.reduce((b, e) => Math.abs(Date.parse(e.dates.start) - Date.parse(mem.dates.start)) < Math.abs(Date.parse(b.dates.start) - Date.parse(mem.dates.start)) ? e : b)
	expect(near).toBe(expected.names.fr)
	// filtre retiré : l'évènement mémorisé (jamais écrasé par le filtre) revient au centre
	await yearBtn(page).locator('.fx').click(); await page.waitForTimeout(300)
	expect(await centerName(page)).toBe(picked)
	// page sans stockage : le carrousel marche
})

test('position mémorisée : tap sur un évènement en plein élan puis retour, 3 fois de suite', async ({ page }) => {
	await open(page, 393, 852)
	await page.locator('.slot[data-center] .album').focus()
	for (let k = 0; k < 3; k++) {
		await page.keyboard.press('ArrowRight')
		await page.waitForTimeout(180) // carte centrale déjà changée, animation pas finie
		const picked = await centerName(page)
		await page.locator('.slot[data-center] .album').click()
		await expect(page.locator('.hero-txt')).toBeVisible()
		await page.goBack()
		await page.waitForSelector('.slot[data-center]'); await page.waitForTimeout(400)
		expect(await centerName(page)).toBe(picked)
		await page.locator('.slot[data-center] .album').focus()
	}
})


test('aperçu : 3 photos sur la carte centrale (ni vidéo ni couverture), qui suivent le centre', async ({ page }) => {
	await open(page, 393, 852)
	await page.locator('.slot[data-center] .album').focus(); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(900)
	const strip = page.locator('.slot[data-center] .strip img')
	await expect(strip).toHaveCount(3)
	const srcs = await strip.evaluateAll((l) => l.map((i) => (i as HTMLImageElement).src))
	expect(srcs.some((s) => s.includes('mp4'))).toBe(false)
	expect(new Set(srcs).size).toBe(3)
	expect((await strip.first().boundingBox())!.width).toBeGreaterThanOrEqual(36)
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/apercu-393.png` })
	await page.locator('.slot[data-center] .album').focus(); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(900)
	await expect(page.locator('.slot[data-center] .strip img')).toHaveCount(3)
	await expect(page.locator('.slot:not([data-center]) .strip')).toHaveCount(0)
	expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(393)
})

test('bouton Au hasard : ≥ 44 px, change toujours de carte, bien dans l\'écran à 375×667', async ({ page }) => {
	await open(page, 375, 667)
	const btn = page.getByRole('button', { name: /Au hasard/ })
	const b = (await btn.boundingBox())!
	expect(b.width).toBeGreaterThanOrEqual(44); expect(b.height).toBeGreaterThanOrEqual(44); expect(b.x + b.width).toBeLessThanOrEqual(375)
	for (let k = 0; k < 4; k++) {
		const before = await centerName(page)
		await btn.click(); await page.waitForTimeout(900)
		expect(await centerName(page)).not.toBe(before)
	}
})
test('grille de secours utilisable avec les nouveaux boutons', async ({ page }) => {
	await open(page, 393, 852)
	await page.locator('.view-btn').click()
	await expect(page.locator('.grid .card').first()).toBeVisible()
	const before = await page.locator('.grid .card').count()
	await yearBtn(page).locator('.fmain').click(); await page.getByRole('option', { name: /^2025/ }).click()
	await expect.poll(() => page.locator('.grid .card').count()).toBeLessThan(before)
})
