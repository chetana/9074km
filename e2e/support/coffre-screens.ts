import type { Page } from '@playwright/test'
import sharp from 'sharp'
import { injectExif } from '../../src/lib/exif'
import { ALL_EVENTS, photoPaths, unclassifiedItem, type CoffreMockOptions } from './coffre-mocks'

// Les écrans principaux du coffre, décrits UNE fois : rendus pour les captures (shots-coffre) et audités par les
// mesures automatiques (coffre-measure). Tous passent par la vraie pile SvelteKit (serveur 5174, session de test).
export interface Screen {
	id: string
	mock?: CoffreMockOptions
	open: (page: Page) => Promise<void>
}

export async function exifPhoto(takenAt: string | null): Promise<Buffer> {
	const base = await sharp({ create: { width: 160, height: 120, channels: 3, background: '#fcd' } }).jpeg().toBuffer()
	return takenAt ? Buffer.from(injectExif(new Uint8Array(base), { takenAt, offset: '+07:00', lat: null, lng: null, make: 'Apple', model: 'iPhone 14 Pro', orientation: 1 })) : base
}

const settle = (page: Page, ms = 600) => page.waitForTimeout(ms)
const longPress = async (page: Page, sel: string) => { const t = page.locator(sel).nth(1); await t.dispatchEvent('pointerdown'); await page.waitForTimeout(650); await t.dispatchEvent('pointerup') }

const SUGG = { id: '2026-11-30_2026-11-30', start: '2026-11-30', end: '2026-11-30', days: 1, count: 38, kind: 'create', eventId: null, proposedName: '30 novembre', paths: photoPaths('2026-11-30', 38) }
const TRI = [unclassifiedItem('2026/10/11/p10.jpg', '2026-10-11'), unclassifiedItem('2026/10/11/p11.jpg', '2026-10-11', 'image', 'Lys'), unclassifiedItem('2026/09/01/p12.jpg', '2026-09-01')]

async function openFab(page: Page, date: string) {
	await page.goto('/coffre')
	await page.waitForSelector('.fab')
	await page.locator('.fab').click()
	await page.waitForSelector('.date-input')
	await page.locator('.date-input').fill(date)
	await page.waitForTimeout(500)
}

export const SCREENS: Screen[] = [
	{ id: '01-dates-annees', open: async (p) => { await p.goto('/coffre'); await p.waitForSelector('.list .card'); await settle(p) } },
	{ id: '02-dates-mois', open: async (p) => { await p.goto('/coffre'); await p.locator('.list .card').first().click(); await settle(p, 900) } },
	{ id: '03-dates-vue-jour', open: async (p) => { await p.goto('/coffre?y=2026&m=10&d=11'); await p.waitForSelector('.tile img'); await settle(p, 900) } },
	{ id: '04-evenements-vide', mock: { events: [] }, open: async (p) => { await p.goto('/coffre?v=events'); await p.waitForSelector('.state'); await settle(p) } },
	{ id: '05c-filtre-annee', mock: { view: 'album' }, open: async (p) => { await p.goto('/coffre?v=events'); await p.waitForSelector('.slot[data-center]'); await p.locator('.fbtn .fmain').first().click(); await p.waitForSelector('.opt'); await settle(p, 700) } },
	{ id: '05b-evenements-carrousel', mock: { view: 'album' }, open: async (p) => { await p.goto('/coffre?v=events'); await p.waitForSelector('.slot[data-center]'); await settle(p, 900) } },
	{ id: '05-evenements-grille', open: async (p) => { await p.goto('/coffre?v=events'); await p.waitForSelector('.card'); await settle(p, 900) } },
	{ id: '06-evenement-vue', open: async (p) => { await p.goto('/coffre?v=events&e=2'); await p.waitForSelector('.cell img'); await settle(p, 900) } },
	{
		id: '07-evenement-picker',
		open: async (p) => {
			await p.goto('/coffre?y=2026&m=10&d=11'); await p.waitForSelector('.tile img'); await longPress(p, '.tile')
			await p.waitForSelector('.selection-bar'); await p.locator('.event-btn').click(); await p.waitForSelector('.sheet .row'); await settle(p, 900)
		},
	},
	{ id: '08-evenement-fiche', open: async (p) => { await p.goto('/coffre?v=events'); await p.waitForSelector('.card'); await p.locator('.new-btn').click(); await p.waitForSelector('.form'); await p.fill('.name-input', 'Pique-nique au parc'); await settle(p, 900) } },
	{ id: '09-upload-evenement-preselectionne', open: async (p) => { await openFab(p, '2026-10-11'); await settle(p) } },
	{
		id: '10-upload-date-exif',
		open: async (p) => {
			await openFab(p, '2026-10-20')
			const [chooser] = await Promise.all([p.waitForEvent('filechooser'), p.getByRole('button', { name: /Choisir des photos/ }).click()])
			await chooser.setFiles([{ name: 'IMG_1.jpg', mimeType: 'image/jpeg', buffer: await exifPhoto('2026-10-11T08:30:00') }])
			await p.waitForSelector('.taken'); await settle(p, 900)
		},
	},
	{ id: '11-suggestion', mock: { suggestions: [SUGG], unclassified: TRI }, open: async (p) => { await p.goto('/coffre?v=events'); await p.locator('.sugg-btn').click(); await p.waitForSelector('section.card'); await settle(p, 900) } },
	{ id: '12-mode-tri', mock: { unclassified: TRI }, open: async (p) => { await p.goto('/coffre?v=events'); await p.locator('.todo').click(); await p.waitForSelector('.sort .photo'); await settle(p, 900) } },
	{ id: '13-export-menu', open: async (p) => { await p.goto('/coffre?v=events'); await p.waitForSelector('.card'); await p.locator('.more-btn').click(); await p.waitForSelector('.sheet .mi'); await settle(p, 900) } },
	{ id: '14-viewer', open: async (p) => { await p.goto('/coffre?v=events&e=2'); await p.waitForSelector('.cell img'); await p.locator('.cell .tile').first().click(); await p.waitForSelector('.viewer-backdrop .cover-btn'); await settle(p, 900) } },
]

export { ALL_EVENTS }
