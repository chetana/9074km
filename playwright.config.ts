import { defineConfig, devices } from '@playwright/test'

// Deux projets :
//  - chromium        : Desktop Chrome, tous les smoke tests historiques.
//  - iphone-14-pro   : émulation mobile 393×852 @3x (specs « coffre » + écrans). Chromium, PAS WebKit : le device
//    « iPhone 14 Pro » de Playwright vaut 393×660 (hauteur de viewport Safari avec barres) et WebKit n'est pas
//    installé ici ; les valeurs sont donc posées explicitement, l'écran plein de l'iPhone 14 Pro étant 393×852.
//
// Deux serveurs dev : 5173 (aucune session : auth-gate, redirections) et 5174 avec le bypass d'auth DEV-ONLY
// E2E_AUTH_USER (vraie pile SvelteKit, session de test). Le serveur 5174 reçoit une base et un S3 INJOIGNABLES :
// même une requête non interceptée ne peut jamais toucher la prod.
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

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
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] },
			testIgnore: /(coffre-measure|shots-coffre)\.spec\.ts$/,
		},
		{
			name: 'iphone-14-pro',
			testMatch: /(coffre-[a-z0-9]+|shots-coffre)\.spec\.ts$/,
			use: {
				browserName: 'chromium',
				viewport: { width: 393, height: 852 },
				screen: { width: 393, height: 852 },
				deviceScaleFactor: 3,
				isMobile: true,
				hasTouch: true,
				userAgent: IPHONE_UA,
			},
		},
	],
	webServer: [
		{
			command: 'npm run dev',
			url: 'http://localhost:5173',
			reuseExistingServer: !process.env.CI,
			timeout: 30_000,
		},
		{
			command: 'npm run dev -- --port 5174 --strictPort',
			url: 'http://localhost:5174',
			reuseExistingServer: !process.env.CI,
			timeout: 30_000,
			env: {
				E2E_AUTH_USER: JSON.stringify({ id: 1, email: 'e2e@example.test', name: 'Chet E2E', picture: '' }),
				DATABASE_URL: 'postgres://e2e:e2e@127.0.0.1:1/e2e',
				GCS_BUCKET_NAME: 'e2e-bucket-injoignable',
				S3_ENDPOINT: 'http://127.0.0.1:1',
				S3_ACCESS_KEY: 'e2e',
				S3_SECRET_KEY: 'e2e',
			},
		},
	],
})
