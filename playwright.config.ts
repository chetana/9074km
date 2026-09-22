import { defineConfig, devices } from '@playwright/test'

// Smoke tests uniquement — pas une suite E2E complète. Volontairement limité aux parcours qui ne
// nécessitent pas de session Logto (aucun mécanisme de mock d'auth n'existe encore) : garde-fous
// anti-régression sur des bugs réels trouvés le 22/09/2026 (nav-dock invisible, gate d'auth,
// boucle de reload PWA). Voir e2e/README.md.
export default defineConfig({
	testDir: './e2e',
	fullyParallel: true,
	retries: 0,
	reporter: 'list',
	use: {
		baseURL: 'http://localhost:5173',
		trace: 'retain-on-failure',
	},
	projects: [
		{ name: 'chromium', use: { ...devices['Desktop Chrome'] } },
	],
	webServer: {
		command: 'npm run dev',
		url: 'http://localhost:5173',
		reuseExistingServer: !process.env.CI,
		timeout: 30_000,
	},
})
