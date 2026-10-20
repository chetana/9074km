import { test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { SCREENS } from './support/coffre-screens'
import { mockCoffre } from './support/coffre-mocks'

// Captures systématiques des écrans du coffre (npm run shots:coffre). Jamais dans le repo : SHOTS_DIR (défaut
// /tmp/lys-coffre-shots). iPhone 14 Pro 393×852 @3x, vraie pile (serveur 5174), zones sûres simulées (CDP).
test.use({ baseURL: 'http://localhost:5174' })
const DIR = process.env.SHOTS_DIR

test.skip(!DIR, 'SHOTS_DIR non défini : lancer `npm run shots:coffre`')

for (const s of SCREENS) {
	test(`capture ${s.id}`, async ({ page, context }) => {
		mkdirSync(DIR!, { recursive: true })
		const cdp = await context.newCDPSession(page)
		await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 59, bottom: 34, left: 0, right: 0 } })
		await mockCoffre(page, { auth: 'real', ...s.mock })
		await s.open(page)
		await page.screenshot({ path: `${DIR}/${s.id}.png` })
	})
}
