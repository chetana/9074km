import { test, expect, type Page } from '@playwright/test'

// Parcours Évènements du coffre avec auth et API simulées (aucun serveur réel touché : toutes les
// routes /api/coffre/* et __data.json sont interceptées). Garde-fou : tailles du khmer (règle du projet).
test.describe.configure({ mode: 'serial' })
test.use({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })

const ev = (id: number, fr: string, kh: string, o: Record<string, unknown> = {}) => ({
	id, names: { fr, en: fr, kh }, nameSrcLang: 'fr', namesPending: false, dates: { start: '2026-10-10', end: '2026-10-12' },
	cover: null, place: 'Lyon', emoji: '🚆', color: 'peach', autoAttach: true, version: 1, count: 2, upcoming: false, ...o,
})
const EVENTS = [
	ev(1, 'Disneyland Paris', 'ឌីស្នីឡែន ប៉ារីស', { upcoming: true, dates: { start: '2026-11-30', end: '2026-11-30' }, color: 'lavender' }),
	ev(2, 'Week-end à Lyon', 'ចុងសប្តាហ៍នៅលីយ៉ុង'),
]
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#fcd"/></svg>'

async function mock(page: Page, user = 'Chetana Yin') {
	const json = (r: any, b: unknown, s = 200) => r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b) })
	await page.route('**/api/auth/sign-in', (r) => r.fulfill({ status: 200, body: 'sign-in (simulé)' }))
	await page.route(/__data\.json/, (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ type: 'data', nodes: [{ type: 'data', data: [{ user: 1 }, { id: 2, email: 3, name: 4, picture: 5 }, 2, 'c@x.fr', user, ''], uses: {} }, { type: 'skip' }] }) }))
	await page.route('**/api/version', (r) => json(r, { version: '1.0.333' }))
	await page.route('**/api/coffre/og-image*', (r) => r.fulfill({ contentType: 'image/svg+xml', body: SVG }))
	await page.route('**/api/coffre/sign-download*', (r) => json(r, { url: 'data:image/svg+xml;base64,' + Buffer.from(SVG).toString('base64') }))
	await page.route('**/api/coffre/events/suggestions', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ suggestions: [] }) }))
	await page.route('**/api/coffre/media/unclassified*', (r) => json(r, { total: 0, items: [], nextCursor: null }))
	await page.route('**/api/coffre/cover*', (r) => json(r, { cover: null }))
	await page.route('**/api/coffre/list*', (r) => {
		const prefix = new URL(r.request().url()).searchParams.get('prefix')
		if (prefix === '2026/10/11/') return json(r, { prefixes: [], items: ['a', 'b', 'c'].map((n) => ({ name: `2026/10/11/${n}.jpg`, size: 1, updated: '' })) })
		return json(r, { prefixes: [], items: [] })
	})
	await page.route(/\/api\/coffre\/(note|meta|reactions)/, (r) => (r.request().url().includes('note') ? r.fulfill({ body: '' }) : json(r, {})))
	await page.route('**/api/coffre/events/for-date*', (r) => json(r, { events: [EVENTS[1]], tags: {}, tagEvents: [] }))
	await page.route(/\/api\/coffre\/events\/\d+\/dates-media/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ count: 0 }) }))
	await page.route(/\/api\/coffre\/events\/\d+\/media/, (r) => json(r, { paths: ['2026/10/11/a.jpg', '2026/10/11/b.jpg'] }))
	await page.route(/\/api\/coffre\/events(\?.*)?$/, (r) => json(r, { events: EVENTS }))
}

// Tailles calculées de chaque texte contenant du khmer (nœud texte direct de l'élément).
async function khmerSizes(page: Page) {
	return page.evaluate(() => {
		const out: { text: string; size: number; cls: string }[] = []
		for (const el of document.querySelectorAll<HTMLElement>('body *')) {
			if (el.closest('.nav-dock, nav, script, style')) continue
			const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent ?? '').join('')
			if (!/[ក-៿]/.test(own)) continue
			if (el.getClientRects().length === 0) continue
			out.push({ text: own.trim().slice(0, 30), size: parseFloat(getComputedStyle(el).fontSize), cls: `${el.tagName.toLowerCase()}.${el.className}` })
		}
		return out
	})
}

const below = (list: { size: number }[], min: number) => list.filter((x) => x.size < min)

test('grille : khmer lisible (≥ 16 px partout, ≥ 18 px sur noms, onglets, séparateurs) et bouton « + » nommé', async ({ page }) => {
	await mock(page, 'Lys Vornsok')
	await page.goto('/coffre?v=events')
	await page.waitForSelector('.card')
	const sizes = await khmerSizes(page)
	expect(sizes.length).toBeGreaterThan(5)
	expect(below(sizes, 16), JSON.stringify(below(sizes, 16))).toEqual([])
	for (const sel of ['.seg .kh', '.name']) {
		const s = await page.locator(sel).first().evaluate((e) => parseFloat(getComputedStyle(e).fontSize))
		expect(s, sel).toBeGreaterThanOrEqual(18)
	}
	const btn = page.getByRole('button', { name: /Nouvel évènement · ព្រឹត្តិការណ៍ថ្មី/ })
	const box = (await btn.boundingBox())!
	expect(box.width).toBeGreaterThanOrEqual(44)
	expect(box.height).toBeGreaterThanOrEqual(44)
})

test('hors ligne : bandeau et badge « À venir » en khmer ≥ 16 px', async ({ page, context }) => {
	await mock(page)
	await page.goto('/coffre?v=events')
	await page.waitForSelector('.card')
	await context.setOffline(true)
	await page.getByRole('button', { name: /Dates$/ }).click()
	await page.getByRole('button', { name: /Évènements/ }).click()
	await page.waitForSelector('.banner')
	const sizes = await khmerSizes(page)
	expect(below(sizes, 16), JSON.stringify(below(sizes, 16))).toEqual([])
})

test('barre de sélection, picker et fiche : khmer des actions et libellés ≥ 18 px', async ({ page }) => {
	await mock(page)
	await page.goto('/coffre?y=2026&m=10&d=11')
	await page.waitForSelector('.tile')
	const tile = page.locator('.tile').first()
	await tile.dispatchEvent('pointerdown')
	await page.waitForTimeout(650)
	await tile.dispatchEvent('pointerup')
	await page.waitForSelector('.selection-bar')
	const ev1 = await page.locator('.event-btn span[lang=km]').evaluate((e) => parseFloat(getComputedStyle(e).fontSize))
	expect(ev1).toBeGreaterThanOrEqual(18)
	const lines = await page.locator('.event-btn').evaluate((e) => Math.round(e.getBoundingClientRect().height))
	expect(lines).toBeLessThan(70) // une ligne fr + une ligne khmer, pas d'empilement sauvage
	await page.locator('.event-btn').click()
	await page.waitForSelector('.sheet .row')
	const picker = await khmerSizes(page)
	const newRow = picker.filter((x) => x.text.includes('ព្រឹត្តិការណ៍ថ្មី'))
	expect(newRow[0]?.size).toBeGreaterThanOrEqual(18)
	await page.locator('.sheet .row.create').click()
	await page.waitForSelector('.form')
	const form = (await khmerSizes(page)).filter((x) => x.cls.includes('lbl') || x.text.includes('ឈ្មោះ') || x.text.includes('ចាប់ពី') || x.text.includes('ដល់') || x.text.includes('អ៊ីម៉ូជី'))
	expect(form.length).toBeGreaterThan(3)
	expect(below(form, 18), JSON.stringify(below(form, 18))).toEqual([])
	const free = page.getByLabel(/Autre emoji · អ៊ីម៉ូជីផ្សេង/)
	await expect(free).toBeVisible()
})

test('tuiles : appui long sans menu image iOS (touch-callout none)', async ({ page }) => {
	await mock(page)
	await page.goto('/coffre?y=2026&m=10&d=11')
	await page.waitForSelector('.tile')
	const v = await page.locator('.tile').first().evaluate((e) => getComputedStyle(e).getPropertyValue('-webkit-touch-callout') || getComputedStyle(e).userSelect)
	expect(['none']).toContain(v)
})
