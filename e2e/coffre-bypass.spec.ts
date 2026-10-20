import { test, expect } from '@playwright/test'
import { mockCoffre } from './support/coffre-mocks'

// Vraie pile SvelteKit + bypass d'auth DEV-ONLY (E2E_AUTH_USER, serveur dev sur 5174, cf. playwright.config.ts et
// e2e/README.md) : hooks, layout.server, +page réels ; seules les routes /api/coffre/* sont interceptées dans le
// navigateur. Le serveur 5174 a une base et un S3 injoignables : une requête oubliée échouerait, jamais la prod.
test.use({ baseURL: 'http://localhost:5174' })

test('le bypass ne vaut que sur ce serveur : la même route protégée répond 400 ici (session de test) et 401 sur le serveur sans variable', async ({ request }) => {
	const here = await request.get('/api/coffre/events/for-date?d=bad')
	expect(here.status()).toBe(400) // requireAuth passe (session de test), puis la validation refuse la date
	const plain = await request.get('http://localhost:5173/api/coffre/events/for-date?d=bad')
	expect(plain.status()).toBe(401) // aucun bypass : la vraie garde d'authentification
})

test('le layout réel porte l\'utilisateur de test (aucune interception de __data.json)', async ({ request }) => {
	const r = await request.get('/coffre/__data.json?x-sveltekit-invalidated=1')
	expect(await r.text()).toContain('Chet E2E')
})

test('onglet Évènements vide : pas de redirection vers Logto, état vide affiché (vraie pile)', async ({ page }) => {
	await mockCoffre(page, { auth: 'real', events: [] })
	await page.goto('/coffre?v=events')
	await expect(page.locator('.state')).toContainText('Aucun évènement pour l’instant')
	expect(page.url()).toContain('/coffre?v=events') // pas de redirection /api/auth/sign-in
	await expect(page.locator('.toggle')).toBeVisible()
})

test('création d\'un évènement de bout en bout (vraie pile, API mockées) : fiche → POST → carte dans la grille', async ({ page }) => {
	const { calls } = await mockCoffre(page, { auth: 'real', events: [] })
	await page.goto('/coffre?v=events')
	await page.waitForSelector('.state')
	await page.locator('.state .primary').click()
	await page.waitForSelector('.form')
	await page.fill('.name-input', 'Pique-nique au parc')
	await page.getByRole('button', { name: /Enregistrer/ }).click()
	await expect.poll(() => calls.find((c) => c.m === 'POST' && c.url === '/api/coffre/events')?.body).toMatchObject({ name: 'Pique-nique au parc', color: 'accent', autoAttach: true })
	await expect(page.locator('.card .name', { hasText: 'Pique-nique au parc' })).toBeVisible()
})
