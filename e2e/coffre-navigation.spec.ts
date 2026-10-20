import { test, expect, type Page } from '@playwright/test'

// Navigation : retour dans la barre du haut d'un évènement, et re-toucher « Coffre » dans le dock ramène à l'accueil. API simulées.
test.use({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
const SHOTS = process.env.SHOTS_DIR
const EV = { id: 2, names: { fr: 'Week-end à Lyon', en: 'Week-end à Lyon', kh: 'ចុងសប្តាហ៍នៅលីយ៉ុង' }, nameSrcLang: 'fr', namesPending: false, dates: { start: '2026-10-10', end: '2026-10-12' }, cover: null, place: 'Lyon', emoji: '🚆', color: 'peach', autoAttach: true, version: 1, count: 2, upcoming: false }
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#fcd"/></svg>'

async function mock(page: Page, count = 0) {
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


const dockCoffre = (page: Page) => page.locator('.dock-tab', { hasText: 'Coffre' })

test('évènement ouvert : bouton retour dans la barre du haut (comme dans Dates), ramène à la liste des évènements', async ({ page }) => {
	await mock(page)
	await page.goto('/coffre?v=events&e=2')
	await page.waitForSelector('.cell img')
	const back = page.locator('.breadcrumb .back-btn')
	await expect(back).toBeVisible()
	await expect(page.locator('.breadcrumb .title')).toContainText('Évènement')
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/navigation-evenement.png` })
	expect((await back.boundingBox())!.width).toBeGreaterThanOrEqual(44)
	await back.click()
	await expect(page.locator('.card').first()).toBeVisible()
	await expect(page.locator('.breadcrumb .back-btn')).toHaveCount(0)
	await expect(page).toHaveURL(/v=events$/)
})

test('liste des évènements : pas de bouton retour (rien au-dessus)', async ({ page }) => {
	await mock(page)
	await page.goto('/coffre?v=events')
	await page.waitForSelector('.card')
	await expect(page.locator('.breadcrumb .back-btn')).toHaveCount(0)
})

test('re-toucher « Coffre » dans le dock depuis un évènement : retour à la liste des évènements', async ({ page }) => {
	await mock(page)
	await page.goto('/coffre?v=events&e=2')
	await page.waitForSelector('.cell img')
	await dockCoffre(page).click()
	await expect(page.locator('.card').first()).toBeVisible()
	await expect(page.locator('.cell')).toHaveCount(0)
	await expect(page).toHaveURL(/v=events$/)
})

test('re-toucher « Coffre » dans le dock depuis un jour : retour à la liste des années', async ({ page }) => {
	await mock(page)
	await page.goto('/coffre?y=2026&m=10&d=11')
	await page.waitForSelector('.tile')
	await dockCoffre(page).click()
	await expect(page.locator('.tile')).toHaveCount(0)
	await expect(page.locator('.breadcrumb .title')).toContainText('Coffre')
	await expect(page.locator('.breadcrumb .back-btn')).toHaveCount(0)
})
