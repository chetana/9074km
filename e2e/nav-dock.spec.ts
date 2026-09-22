import { test, expect } from '@playwright/test'

// Régression du 22/09/2026 : .nav-dock n'avait pas position+z-index explicites et peignait SOUS
// Sky.svelte (position: fixed; z-index: 0), lavant visuellement le badge de version sans qu'aucune
// erreur console n'apparaisse. On utilise le lien de partage coffre public (pas besoin de session).

test('le nav-dock reste au-dessus de Sky (position+z-index explicites)', async ({ page }) => {
	await page.goto('/coffre?y=2026&m=01&d=01&f=photo.jpg')

	const dock = page.locator('.nav-dock')
	await expect(dock).toBeVisible()

	const style = await dock.evaluate((el) => {
		const s = getComputedStyle(el)
		return { position: s.position, zIndex: s.zIndex }
	})
	expect(style.position).not.toBe('static')
	expect(style.zIndex).not.toBe('auto')

	// Le badge de version doit être réellement affiché, pas juste présent dans le DOM.
	const versionBadge = page.locator('.dock-version')
	await expect(versionBadge).toBeVisible()
	await expect(versionBadge).toHaveText(/^v\d+\.\d+\.\d+$/)
})

test('le nav-dock est masqué sur la galerie publique /fiancailles', async ({ page }) => {
	await page.goto('/fiancailles')
	await expect(page.locator('.nav-dock')).toHaveCount(0)
})
