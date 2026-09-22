import { test, expect } from '@playwright/test'

// Sans session Logto, +layout.svelte redirige silencieusement vers /api/auth/sign-in — SAUF pour
// les deux exceptions publiques (partage coffre ?f=, galerie /fiancailles). Cette logique repose
// sur une comparaison de pathname/query params fragile ; ces tests protègent les deux sens de
// l'erreur (fuite d'accès ET redirection à tort d'un lien public).

test('une route protégée sans session redirige vers sign-in', async ({ page }) => {
	await page.route('**/api/auth/sign-in', (route) => route.fulfill({ status: 200, body: 'ok' }))
	await page.goto('/chat')
	await page.waitForURL('**/api/auth/sign-in')
})

test('le lien de partage coffre (?f=) ne redirige PAS vers sign-in', async ({ page }) => {
	let redirected = false
	await page.route('**/api/auth/sign-in', (route) => {
		redirected = true
		return route.fulfill({ status: 200, body: 'ok' })
	})
	await page.goto('/coffre?y=2026&m=01&d=01&f=photo.jpg')
	await page.waitForTimeout(500) // laisse le temps à un éventuel redirect silencieux de partir
	expect(redirected).toBe(false)
	expect(page.url()).toContain('/coffre')
})

test('la galerie /fiancailles ne redirige PAS vers sign-in', async ({ page }) => {
	let redirected = false
	await page.route('**/api/auth/sign-in', (route) => {
		redirected = true
		return route.fulfill({ status: 200, body: 'ok' })
	})
	await page.goto('/fiancailles')
	await page.waitForTimeout(500)
	expect(redirected).toBe(false)
	expect(page.url()).toContain('/fiancailles')
})
