import { test, expect, type Page } from '@playwright/test'

// « Ajouter les photos de ces dates » (menu ⋯ d'un évènement) et « Tout sélectionner » (vue d'un jour), API simulées.
test.use({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
const SHOTS = process.env.SHOTS_DIR
const EV = { id: 2, names: { fr: 'Week-end à Lyon', en: 'Week-end à Lyon', kh: 'ចុងសប្តាហ៍នៅលីយ៉ុង' }, nameSrcLang: 'fr', namesPending: false, dates: { start: '2026-10-10', end: '2026-10-12' }, cover: null, place: 'Lyon', emoji: '🚆', color: 'peach', autoAttach: true, version: 1, count: 2, upcoming: false }
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#fcd"/></svg>'

async function mock(page: Page, count: number) {
	const posts: string[] = []
	const json = (r: any, b: unknown, s = 200) => r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b) })
	await page.route('**/api/auth/sign-in', (r) => r.fulfill({ status: 200, body: 'sign-in (simulé)' }))
	await page.route(/__data\.json/, (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ type: 'data', nodes: [{ type: 'data', data: [{ user: 1 }, { id: 2, email: 3, name: 4, picture: 5 }, 2, 'c@x.fr', 'Chet', ''], uses: {} }, { type: 'skip' }] }) }))
	await page.route('**/api/version', (r) => json(r, { version: '1.0.333' }))
	await page.route('**/api/coffre/og-image*', (r) => r.fulfill({ contentType: 'image/svg+xml', body: SVG }))
	await page.route('**/api/coffre/sign-download*', (r) => json(r, { url: 'data:image/svg+xml;base64,' + Buffer.from(SVG).toString('base64') }))
	await page.route('**/api/coffre/events/suggestions', (r) => json(r, { suggestions: [] }))
	await page.route('**/api/coffre/media/unclassified*', (r) => json(r, { total: 0, items: [], nextCursor: null }))
	await page.route('**/api/coffre/cover*', (r) => json(r, { cover: null }))
	await page.route('**/api/coffre/list*', (r) => json(r, { prefixes: [], items: Array.from({ length: 30 }, (_, i) => ({ name: `2026/10/11/p${String(i).padStart(2, '0')}.jpg`, size: 1, updated: '' })) }))
	await page.route(/\/api\/coffre\/(note|meta|reactions)/, (r) => (r.request().url().includes('note') ? r.fulfill({ body: '' }) : json(r, {})))
	await page.route('**/api/coffre/events/for-date*', (r) => json(r, { events: [], tags: {}, tagEvents: [] }))
	await page.route(/\/api\/coffre\/events\/2\/dates-media/, (r) => {
		if (r.request().method() === 'POST') { posts.push('POST'); return json(r, { success: true, added: count }) }
		return json(r, { count })
	})
	await page.route(/\/api\/coffre\/events\/2\/media/, (r) => json(r, { paths: ['2026/10/11/a.jpg', '2026/10/11/b.jpg'] }))
	await page.route(/\/api\/coffre\/events(\?.*)?$/, (r) => json(r, { events: [EV] }))
	return { posts }
}

async function openMenu(page: Page) {
	await page.goto('/coffre?v=events&e=2')
	await page.waitForSelector('.cell img')
	await page.getByRole('button', { name: /Plus/ }).click()
	await page.waitForSelector('.menu .mi')
}

test('menu ⋯ : compteur serveur, confirmation avec le nombre, un seul POST, toast du résultat', async ({ page }) => {
	const { posts } = await mock(page, 37)
	await openMenu(page)
	const item = page.locator('.mi.add-range')
	await expect(item).toContainText('Ajouter les photos de ces dates (37)')
	await expect(item).toBeEnabled()
	expect(await item.locator('.kh').evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(18)
	expect((await item.boundingBox())!.height).toBeGreaterThanOrEqual(44)
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/rattacher-1-menu.png` })
	await item.click()
	await expect(page.locator('.confirm-q').first()).toContainText('Ajouter 37 photo(s)')
	expect(posts).toEqual([]) // rien n'est envoyé avant la confirmation
	expect(await page.locator('.confirm .mi .kh').first().evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(18)
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/rattacher-2-confirmation.png` })
	await page.locator('.confirm .mi').first().click()
	await expect(page.locator('.toast', { hasText: '37 photo(s) ajoutée(s)' })).toBeVisible()
	expect(posts).toEqual(['POST'])
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/rattacher-3-toast.png` })
})

test('menu ⋯ : désactivée quand N = 0, aucun POST possible', async ({ page }) => {
	const { posts } = await mock(page, 0)
	await openMenu(page)
	const item = page.locator('.mi.add-range')
	await expect(item).toContainText('(0)')
	await expect(item).toBeDisabled()
	await item.click({ force: true }).catch(() => {})
	expect(posts).toEqual([])
})

test('vue d\'un jour : « Tout sélectionner (N) » prend le jour entier (30), puis « Ajouter à… » reste proposé', async ({ page }) => {
	await mock(page, 0)
	await page.goto('/coffre?y=2026&m=10&d=11')
	await page.waitForSelector('.tile')
	const tile = page.locator('.tile').first()
	await tile.dispatchEvent('pointerdown')
	await page.waitForTimeout(650)
	await tile.dispatchEvent('pointerup')
	await page.waitForSelector('.selection-bar')
	await expect(page.locator('.selection-bar > span')).toContainText('1 sélectionné')
	const all = page.locator('.select-all')
	await expect(all).toContainText('Tout sélectionner (30)')
	expect(await all.locator('span[lang=km]').evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(18)
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/rattacher-4-tout-selectionner-avant.png` })
	await all.click()
	await expect(page.locator('.selection-bar > span')).toContainText('30 sélectionné')
	await expect(all).toHaveCount(0) // tout est déjà sélectionné
	await expect(page.locator('.event-btn')).toBeVisible()
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/rattacher-5-tout-selectionne.png` })
})
