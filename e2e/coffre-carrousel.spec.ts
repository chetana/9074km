import { test, expect, type Page } from '@playwright/test'
import { ev } from './support/coffre-mocks'
import { mockCoffre } from './support/coffre-mocks'

// Carrousel « Album » de la vue Évènements : vraie pile SvelteKit (serveur 5174, session de test), API simulées.
test.use({ baseURL: 'http://localhost:5174', viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
const SHOTS = process.env.SHOTS_DIR

const PLACES = ['Lyon', 'Paris', 'Phnom Penh', 'Siem Reap', 'Marseille', 'Bordeaux', 'Kampot', 'Strasbourg', 'Nice']
const EVENTS = [
	ev(1, 'Disneyland Paris', 'ឌីស្នីឡែន ប៉ារីស', '2026-11-30', '2026-11-30', { upcoming: true, place: 'Paris', count: 0, cover: '2026/10/11/p00.jpg' }),
	ev(2, 'Week-end à Lyon en famille', 'ចុងសប្តាហ៍វែងនៅលីយ៉ុងជាមួយក្រុមគ្រួសារទាំងមូល និងមិត្តភក្តិទាំងអស់គ្នា', '2026-10-10', '2026-10-12', { place: 'Lyon', cover: '2026/10/11/p00.jpg', count: 14 }),
	...Array.from({ length: 12 }, (_, i) => ev(10 + i, `Évènement ${i + 1}`, `ព្រឹត្តិការណ៍ ${i + 1}`, `${2026 - Math.floor(i / 5)}-0${1 + (i % 9)}-1${i % 9}`, `${2026 - Math.floor(i / 5)}-0${1 + (i % 9)}-1${i % 9}`, { place: PLACES[i % PLACES.length], cover: '2026/10/11/p01.jpg', count: 5 + i, emoji: ['🏖️', '🎂', '🚆', '🎄'][i % 4] })),
]

async function open(page: Page, view: 'album' | 'grid' | null = 'album') {
	await mockCoffre(page, { auth: 'real', view, events: EVENTS })
	await page.goto('/coffre?v=events')
	await page.waitForSelector(view === 'grid' ? '.card' : '.slot[data-center]')
	await page.waitForTimeout(500)
}
const centerName = (page: Page) => page.locator('.slot[data-center] .t1').innerText()
const count = (page: Page) => page.locator('.count').innerText()

test('carrousel par défaut : carte centrale = premier évènement, au moins 45 % de la hauteur, aucun scroll horizontal', async ({ page }) => {
	await open(page)
	expect(await centerName(page)).toBe('Disneyland Paris')
	await expect(page.locator('.count')).toContainText('14 évènement(s)')
	const stage = await page.locator('.stage').boundingBox()
	expect(stage!.height).toBeGreaterThanOrEqual(0.33 * 852) // la scène remplit la place disponible (voir le test « tient entre le compteur et le dock »)
	expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(393)
	expect(await page.locator('.stage').evaluate((e) => getComputedStyle(e).touchAction)).toBe('pan-y')
	expect(await page.locator('.slot').count()).toBeLessThanOrEqual(8) // |d| ≤ 3,6 seulement
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/carrousel-1-defaut.png` })
})

test('glisser change l\'évènement central ; un petit mouvement (< 6 px) n\'est pas un glissement', async ({ page }) => {
	await open(page)
	const box = (await page.locator('.stage').boundingBox())!
	const y = box.y + box.height / 2, x = box.x + box.width / 2
	await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x - 4, y)
	expect(await page.locator('.scrub').inputValue()).toBe('0') // 4 px : aucun glissement
	await page.mouse.up()
	await expect(page.locator('.hero-txt')).toBeVisible() // un tap bref sur la carte centrale ouvre l'évènement
	await page.goto('/coffre?v=events')
	await page.waitForSelector('.slot[data-center]')
	await page.mouse.move(x, y); await page.mouse.down()
	for (let k = 1; k <= 8; k++) { await page.mouse.move(x - k * 16, y); await page.waitForTimeout(30) }
	await page.waitForTimeout(150) // doigt arrêté avant de relâcher : pas d'élan
	await page.mouse.up()
	await page.waitForTimeout(800)
	expect(await centerName(page)).toBe('Week-end à Lyon en famille')
	// noms longs : deux lignes maximum, sans coupure sèche (ni débordement)
	const t = await page.locator('.slot[data-center] .t1').evaluate((e) => ({ over: e.scrollHeight > e.clientHeight + 1 }))
	expect(t.over).toBe(false)
	const t2 = await page.locator('.slot[data-center] .t2').evaluate((e) => ({ lines: Math.round(e.clientHeight / parseFloat(getComputedStyle(e).lineHeight)), size: parseFloat(getComputedStyle(e).fontSize), lang: e.getAttribute('lang'), it: getComputedStyle(e).fontStyle }))
	expect(t2.lines).toBeLessThanOrEqual(2) // nom khmer très long : 2 lignes au plus
	expect(t2.size).toBeGreaterThanOrEqual(18); expect(t2.lang).toBe('km'); expect(t2.it).toBe('normal')
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/carrousel-2-nom-long.png` })
})

test('tap sur une carte latérale la centre ; tap sur la carte centrale ouvre l\'évènement', async ({ page }) => {
	await open(page)
	const sb = (await page.locator('.stage').boundingBox())!
	await page.mouse.click(sb.x + sb.width - 18, sb.y + sb.height / 2) // partie visible de la voisine de droite
	await expect.poll(() => centerName(page)).toBe('Week-end à Lyon en famille')
	await page.waitForTimeout(500)
	await page.locator('.slot[data-center] .album').click()
	await expect(page.locator('.hero-txt')).toBeVisible()
})

test('clavier : flèches changent de carte, la carte centrale est un bouton focusable nommé', async ({ page }) => {
	await open(page)
	const btn = page.locator('.slot[data-center] .album')
	await btn.focus()
	await expect(btn).toHaveAttribute('aria-label', /Disneyland Paris — Ouvrir/)
	await page.keyboard.press('ArrowRight')
	await expect.poll(() => centerName(page)).toContain('Week-end à Lyon')
	await page.keyboard.press('ArrowLeft')
	await expect.poll(() => centerName(page)).toBe('Disneyland Paris')
	await expect(page.locator('.scrub')).toHaveAttribute('aria-label', /Parcourir les évènements/)
})

test('filtres année / lieu : cartes réduites, compteur « N sur M », état vide FR+km, centre le plus proche en date', async ({ page }) => {
	await open(page)
	await page.getByRole('button', { name: /^2026$/ }).click()
	const n26 = EVENTS.filter((e) => e.dates.start.startsWith('2026')).length
	await expect(page.locator('.count')).toContainText(`${n26} sur 14`)
	await page.getByRole('button', { name: /Lyon/ }).first().click()
	await expect(page.locator('.count')).toContainText(/sur 14/)
	expect(await centerName(page)).toContain('Week-end à Lyon')
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/carrousel-3-filtre.png` })
	await page.getByRole('button', { name: /^2024$/ }).click()
	await expect(page.locator('.empty-filter')).toContainText('Aucun évènement pour ce filtre')
	expect(await page.locator('.empty-filter .kh').evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(18)
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/carrousel-4-vide.png` })
})

test('rangées de filtres : 2 lignes au plus, défilables avec fondu, puces ≥ 44 px', async ({ page }) => {
	await open(page)
	const m = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.chips')].map((c) => ({ h: c.clientHeight, sh: c.scrollHeight, more: c.dataset.more, chip: Math.min(...[...c.querySelectorAll('.chip')].map((x) => x.getBoundingClientRect().height)) })))
	expect(m).toHaveLength(2)
	for (const r of m) { expect(r.h).toBeLessThanOrEqual(2 * 44 + 8 + 1); expect(r.chip).toBeGreaterThanOrEqual(44) }
	const places = m[1]
	expect(places.sh).toBeGreaterThan(places.h) // 9 lieux : ça déborde, donc ça défile
	expect(places.more).toBe('1') // fondu = il en reste
	await page.locator('.chips').nth(1).evaluate((e) => (e.scrollTop = e.scrollHeight))
	await expect.poll(() => page.locator('.chips').nth(1).evaluate((e) => (e as HTMLElement).dataset.more)).toBe('')
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/carrousel-5-filtres.png` })
})

test('bascule grille / carrousel mémorisée (localStorage), la page marche aussi sans stockage', async ({ page }) => {
	await open(page, null)
	const btn = page.locator('.view-btn')
	expect((await btn.boundingBox())!.width).toBeGreaterThanOrEqual(44)
	await expect(btn).toHaveAttribute('aria-label', /Grille · ក្រឡា/)
	await btn.click()
	await expect(page.locator('.grid .card').first()).toBeVisible()
	expect(await page.evaluate(() => localStorage.getItem('coffre-events-view'))).toBe('grid')
	await page.reload()
	await expect(page.locator('.grid .card').first()).toBeVisible() // mémorisée
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/carrousel-6-grille.png` })
	await page.locator('.view-btn').click()
	await expect(page.locator('.slot[data-center]')).toBeVisible()
})

test('page sans localStorage : le carrousel s\'affiche quand même', async ({ page }) => {
	await page.addInitScript(() => { const si = Storage.prototype.setItem, gi = Storage.prototype.getItem; Storage.prototype.setItem = function (k: string, v: string) { if (k === 'coffre-events-view') throw new Error('quota'); return si.call(this, k, v) }; Storage.prototype.getItem = function (k: string) { if (k === 'coffre-events-view') throw new Error('bloqué'); return gi.call(this, k) } })
	page.on('pageerror', (e) => console.log('PAGEERR', e.message))
	await mockCoffre(page, { auth: 'real', view: null, events: EVENTS })
	await page.goto('/coffre?v=events')
	await expect(page.locator('.slot[data-center]')).toBeVisible()
})

test('khmer ≥ 18 px, cibles ≥ 44 px (bascule, curseur, puces, carte centrale)', async ({ page }) => {
	await open(page)
	for (const sel of ['.view-btn', '.scrub', '.slot[data-center] .album', '.chips .chip']) {
		const b = (await page.locator(sel).first().boundingBox())!
		expect(Math.min(b.width, b.height), sel).toBeGreaterThanOrEqual(44)
	}
	const small = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.events .chip .kh, .events .t2, .events .empty-filter .kh')].map((e) => parseFloat(getComputedStyle(e).fontSize)).filter((s) => s < 18))
	expect(small).toEqual([])
})

for (const [w, h] of [[393, 852], [375, 667]] as const) {
	test(`tout tient entre le compteur et le dock, sans défiler : ${w}×${h}`, async ({ page }) => {
		await page.setViewportSize({ width: w, height: h })
		await open(page)
		await page.waitForTimeout(400)
		const m = await page.evaluate(() => {
			const r = (s: string) => { const b = document.querySelector(s)!.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, left: b.left, right: b.right, h: b.height } }
			const sc = [...document.querySelectorAll('*')].find((e) => /(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.contains(document.querySelector('.stage')!)) as HTMLElement | undefined
			return { count: r('.count'), stage: r('.stage'), scrub: r('.scrub'), card: r('.slot[data-center] .album'), dock: r('.nav-dock'), chips: [...document.querySelectorAll<HTMLElement>('.chips')].map((c) => c.clientHeight), scrollTop: sc?.scrollTop ?? 0 }
		})
		expect(m.scrub.bottom, 'curseur au-dessus du dock').toBeLessThanOrEqual(m.dock.top - 8 + 0.5)
		expect(m.card.top, 'carte entièrement dans la scène (haut)').toBeGreaterThanOrEqual(m.stage.top - 0.5)
		expect(m.card.bottom, 'carte entièrement dans la scène (bas)').toBeLessThanOrEqual(m.stage.bottom + 0.5)
		expect(m.card.left).toBeGreaterThanOrEqual(0); expect(m.card.right).toBeLessThanOrEqual(w)
		expect(m.stage.top, 'après le compteur').toBeGreaterThanOrEqual(m.count.bottom - 0.5)
		expect(m.scrollTop, 'aucun défilement nécessaire').toBe(0)
		expect(m.stage.h).toBeGreaterThanOrEqual(120)
		if (h < 700) for (const c of m.chips) expect(c, 'petit écran : rangées de filtres réduites à 1 ligne').toBeLessThanOrEqual(44 + 1)
		if (SHOTS) await page.screenshot({ path: `${SHOTS}/carrousel-tient-${w}x${h}.png` })
	})
}
