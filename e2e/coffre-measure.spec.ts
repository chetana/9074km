import { test, expect, type Page } from '@playwright/test'
import { SCREENS } from './support/coffre-screens'
import { mockCoffre } from './support/coffre-mocks'

// Mesures automatiques par écran (iPhone 14 Pro, zones sûres simulées par CDP : haut 59, bas 34).
test.use({ baseURL: 'http://localhost:5174' })
const H = 852
const SAFE_TOP = 59
const SAFE_BOTTOM = 34

// `.search input` : le <label> parent de 44 px est la vraie cible. Cibles dont la taille < 44 px est assumée (zone de toucher étendue ou non tactile).
const ALLOW_SMALL = ['.sky', '.dot', 'input[type="checkbox"]', 'input[type="radio"]', '.search input']

interface Report {
	small: string[]
	kmSmall: string[]
	overflowX: string[]
	unsafe: string[]
	scrollW: number
}

async function audit(page: Page): Promise<Report> {
	return page.evaluate(
		({ allow, h, top, bottom }) => {
			const vw = window.innerWidth
			const label = (el: Element) => {
				const e = el as HTMLElement
				const t = (e.getAttribute('aria-label') || e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30)
				return `${e.tagName.toLowerCase()}${e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).join('.') : ''}[${t}]`
			}
			const visible = (el: Element) => {
				const r = el.getBoundingClientRect()
				const cs = getComputedStyle(el)
				return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.01
			}
			const hit = (el: Element) => {
				const r = el.getBoundingClientRect()
				if (r.right <= 0 || r.left >= vw || r.bottom <= 0 || r.top >= h) return false
				const x = Math.min(Math.max(r.left + r.width / 2, 1), vw - 1)
				const y = Math.min(Math.max(r.top + r.height / 2, 1), h - 1)
				const t = document.elementFromPoint(x, y)
				return !!t && (el === t || el.contains(t) || t.contains(el))
			}
			const rep: Report = { small: [], kmSmall: [], overflowX: [], unsafe: [], scrollW: document.documentElement.scrollWidth }
			const inScrollX = (el: Element) => {
				let p = el.parentElement
				while (p) {
					const o = getComputedStyle(p).overflowX
					if (o === 'auto' || o === 'scroll' || o === 'hidden') return true
					p = p.parentElement
				}
				return false
			}
			const sel = 'button, a[href], [role="button"], [role="tab"], input:not([type="hidden"]), select, textarea, summary'
			for (const el of document.querySelectorAll(sel)) {
				if (!visible(el) || !hit(el)) continue
				if (allow.some((a) => el.matches(a))) continue
				const r = el.getBoundingClientRect()
				if (r.width < 43.5 || r.height < 43.5) rep.small.push(`${label(el)} ${Math.round(r.width)}x${Math.round(r.height)}`)
				const fixed = (() => {
					let p: Element | null = el
					while (p) {
						const cs = getComputedStyle(p)
						if (p !== el && (cs.overflowY === 'auto' || cs.overflowY === 'scroll')) return false
						if (cs.position === 'fixed') return true
						p = p.parentElement
					}
					return false
				})()
				if (fixed && (r.top < top - 0.5 || r.bottom > h - bottom + 0.5) && r.top < h && r.bottom > 0) {
					const inTop = r.top < top - 0.5
					const inBottom = r.bottom > h - bottom + 0.5
					const full = r.height > h * 0.6
					if (!full && (inTop || inBottom)) rep.unsafe.push(`${label(el)} top=${Math.round(r.top)} bottom=${Math.round(r.bottom)}`)
				}
			}
			for (const el of document.querySelectorAll('[lang="km"]')) {
				if (!visible(el) || !hit(el)) continue
				const fs = parseFloat(getComputedStyle(el).fontSize)
				const primary = !!el.closest('.seg, .yes, .go, .save, .skip, .primary, .btn-confirm, .todo, .create, .cta')
				if (fs < (primary ? 18 : 13) - 0.01) rep.kmSmall.push(`${label(el)} ${fs}px${primary ? ' (primaire)' : ''}`)
			}
			for (const el of document.body.querySelectorAll('*')) {
				if (!visible(el) || inScrollX(el)) continue
				const r = el.getBoundingClientRect()
				if (r.right > vw + 1 && r.left < vw) rep.overflowX.push(`${label(el)} right=${Math.round(r.right)}`)
			}
			return rep
		},
		{ allow: ALLOW_SMALL, h: H, top: SAFE_TOP, bottom: SAFE_BOTTOM }
	)
}

for (const s of SCREENS) {
	test(`mesure ${s.id}`, async ({ page, context }) => {
		const cdp = await context.newCDPSession(page)
		await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: SAFE_TOP, bottom: SAFE_BOTTOM, left: 0, right: 0 } })
		await mockCoffre(page, { auth: 'real', ...s.mock })
		await s.open(page)
		const r = await audit(page)
		console.log(`[${s.id}]`, JSON.stringify(r))
		expect.soft(r.small, `cibles < 44 px`).toEqual([])
		expect.soft(r.kmSmall, `khmer trop petit`).toEqual([])
		expect.soft(r.scrollW, 'scroll horizontal').toBeLessThanOrEqual(393)
		expect.soft(r.overflowX, 'éléments hors écran à droite').toEqual([])
		expect.soft(r.unsafe, 'interactifs fixes dans la zone non sûre').toEqual([])
	})
}

// Géométrie, pas seulement une chaîne CSS : avec une zone sûre simulée de 59 px, rien d'interactif ni le texte
// du header ne doit commencer au-dessus de la Dynamic Island.
for (const id of ['01-dates-annees', '04-evenements-vide']) {
	test(`header sous la zone sûre du haut : ${id}`, async ({ page, context }) => {
		const s = SCREENS.find((x) => x.id === id)!
		const cdp = await context.newCDPSession(page)
		await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: SAFE_TOP, bottom: SAFE_BOTTOM, left: 0, right: 0 } })
		await mockCoffre(page, { auth: 'real', ...s.mock })
		await s.open(page)
		const m = await page.evaluate(() => {
			const header = document.querySelector('.header')!
			const tops = [...header.querySelectorAll('button, a[href]')].map((e) => e.getBoundingClientRect().top)
			return { inset: getComputedStyle(header).paddingTop, headerTop: header.getBoundingClientRect().top, firstInteractive: Math.min(...tops), n: tops.length }
		})
		expect(m.n).toBeGreaterThan(0)
		expect(m.firstInteractive, `premier élément interactif du header à ${m.firstInteractive}px`).toBeGreaterThanOrEqual(SAFE_TOP)
	})
}
