import { test, expect } from '@playwright/test'

// checkVersion() (+layout.svelte) compare /api/version au bundle APP_VERSION au montage. Si le
// serveur annonce une version différente, le client recharge — UNE SEULE FOIS par version
// détectée (garde-fou sessionStorage.updatedTo), jamais en boucle. Testé sur le lien de partage
// coffre public (pas besoin de session) où checkVersion() s'exécute normalement.

test('reload une fois sur nouvelle version, jamais en boucle', async ({ page }) => {
	await page.route('**/api/version', (route) =>
		route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ version: '99.99.99' }) })
	)

	let loadCount = 0
	page.on('load', () => { loadCount++ })

	await page.goto('/coffre?y=2026&m=01&d=01&f=photo.jpg')
	await page.waitForLoadState('networkidle')

	// Laisse le temps au reload déclenché par checkVersion() de se produire.
	await expect.poll(() => loadCount, { timeout: 5_000 }).toBeGreaterThanOrEqual(2)

	const updatedTo = await page.evaluate(() => sessionStorage.getItem('updatedTo'))
	expect(updatedTo).toBe('99.99.99')

	// Un second passage de checkVersion (même version en base) ne doit PAS redéclencher de reload.
	const loadsAfterFirstReload = loadCount
	await page.waitForTimeout(1_500)
	expect(loadCount).toBe(loadsAfterFirstReload)
})
