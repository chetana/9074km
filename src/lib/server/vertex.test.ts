// Test de régression sur le bug du 22/09/2026 : le filet de secours anti-corruption rappelait
// `callGemini()`, qui retente GLM en premier à chaque fois — donc une corruption produite par GLM
// pouvait se reproduire à l'identique au lieu d'escalader vers Gemini fort. Ce test verrouille le
// comportement attendu : sur sortie suspecte, l'escalade appelle Gemini DIRECTEMENT (jamais un 2e
// appel à chatGo), et journalise l'incident.
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Fake service account (clé RSA jetable générée à la volée) : getAccessToken() dans vertex.ts
// signe un vrai JWT avec crypto.createSign, une fausse chaîne PEM le ferait planter avant même le
// fetch. `vi.hoisted` car `vi.mock` ci-dessous est hoisté au-dessus de toute variable top-level.
const { FAKE_SERVICE_ACCOUNT } = vi.hoisted(() => {
	const { generateKeyPairSync } = require('crypto') as typeof import('crypto')
	const { privateKey } = generateKeyPairSync('rsa', {
		modulusLength: 512,
		privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
		publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
	})
	return {
		FAKE_SERVICE_ACCOUNT: JSON.stringify({
			client_email: 'test@test.iam.gserviceaccount.com',
			private_key: privateKey,
		}),
	}
})

vi.mock('$env/dynamic/private', () => ({
	env: {
		GCS_SERVICE_ACCOUNT_JSON: FAKE_SERVICE_ACCOUNT,
		VERTEX_PROJECT_ID: 'test-project',
		VERTEX_LOCATION: 'us-central1',
	},
}))

const chatGoMock = vi.fn()
const glmEnabledMock = vi.fn(() => true)
const goFallbackMock = vi.fn((): string | null => null)
vi.mock('./glm', () => ({
	glmEnabled: () => glmEnabledMock(),
	goFallbackModel: () => goFallbackMock(),
	chatGo: (system: string, user: string, maxTokens?: number, model?: string) => chatGoMock(system, user, maxTokens, model),
	GLM_ADAPT: '',
}))

const logTranslationIssueMock = vi.fn()
vi.mock('./translation-issues', () => ({
	logTranslationIssue: (issue: unknown) => logTranslationIssueMock(issue),
}))

import { geminiTranslateAll } from './vertex'

function fakeGeminiCandidate(json: object) {
	return JSON.stringify({
		candidates: [{ content: { parts: [{ text: JSON.stringify(json) }] }, finishReason: 'STOP' }],
	})
}

beforeEach(() => {
	chatGoMock.mockReset()
	logTranslationIssueMock.mockReset()
	glmEnabledMock.mockReturnValue(true)
	goFallbackMock.mockReturnValue(null)
	vi.restoreAllMocks()
})

describe('geminiTranslateAll — escalade GLM → Gemini fort', () => {
	it('sortie GLM propre : aucun appel réseau Gemini, aucun incident journalisé', async () => {
		chatGoMock.mockResolvedValueOnce(JSON.stringify({ lang: 'fr', terms: [], en: 'Hello', kh: 'សួស្តី', fr: 'Bonjour' }))
		const fetchSpy = vi.spyOn(global, 'fetch')

		const result = await geminiTranslateAll('Bonjour')

		expect(result.kh).toBe('សួស្តី')
		expect(chatGoMock).toHaveBeenCalledTimes(1)
		expect(fetchSpy).not.toHaveBeenCalled()
		expect(logTranslationIssueMock).not.toHaveBeenCalled()
	})

	it('latin collé détecté : escalade DIRECTE vers Gemini fort, chatGo jamais rappelé une 2e fois (bug du 22/09)', async () => {
		// GLM produit une corruption réelle observée le 22/09 ("boutons" → latin collé au khmer).
		chatGoMock.mockResolvedValueOnce(JSON.stringify({ lang: 'fr', terms: [], en: 'buttons', kh: 'បុortonexus', fr: 'boutons' }))
		vi.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
			const href = String(url?.url ?? url)
			if (href.includes('oauth2.googleapis.com')) {
				return new Response(JSON.stringify({ access_token: 'fake-token' }), { status: 200 })
			}
			// Gemini fort : sortie khmère correcte, sans corruption.
			return new Response(fakeGeminiCandidate({ lang: 'fr', terms: [], en: 'buttons', kh: 'ប៊ូតុង', fr: 'boutons' }), { status: 200 })
		})

		const result = await geminiTranslateAll('boutons')

		expect(result.kh).toBe('ប៊ូតុង') // version corrigée par Gemini, jamais la corruption GLM
		expect(chatGoMock).toHaveBeenCalledTimes(1) // JAMAIS un 2e appel à GLM — c'était le bug
		expect(logTranslationIssueMock).toHaveBeenCalledTimes(1)
		expect(logTranslationIssueMock.mock.calls[0][0]).toMatchObject({ reason: 'glued_latin', engine: 'glm' })
	})

	it('script étranger détecté : même escalade, raison journalisée "foreign_script"', async () => {
		chatGoMock.mockResolvedValueOnce(JSON.stringify({ lang: 'kh', terms: [], en: 'Hello', kh: 'สวัสดี', fr: 'Bonjour' }))
		vi.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
			const href = String(url?.url ?? url)
			if (href.includes('oauth2.googleapis.com')) {
				return new Response(JSON.stringify({ access_token: 'fake-token' }), { status: 200 })
			}
			return new Response(fakeGeminiCandidate({ lang: 'kh', terms: [], en: 'Hello', kh: 'សួស្តី', fr: 'Bonjour' }), { status: 200 })
		})

		const result = await geminiTranslateAll('Bonjour')

		expect(result.kh).toBe('សួស្តី')
		expect(chatGoMock).toHaveBeenCalledTimes(1)
		expect(logTranslationIssueMock.mock.calls[0][0]).toMatchObject({ reason: 'foreign_script', engine: 'glm' })
	})

	it('terme annoncé absent du khmer, même chez Gemini fort : on GARDE la traduction forte (bug du 01/10 : message laissé en français)', async () => {
		// Le 01/10/2026, « je me sens moins malade » est resté en français partout : GLM puis Gemini
		// annonçaient chacun un terme (`terms`) écrit autrement dans le khmer final, termsEchoed
		// rejetait les DEUX, le découpage en morceaux retombait sur la même erreur, et le texte
		// source était conservé. Un garde-fou heuristique ne doit jamais coûter la traduction.
		const divergent = { lang: 'fr', terms: [{ src: 'malade', kh: 'ឈឺ' }], en: 'I feel less sick', kh: 'បងមិនសូវអីទេ', fr: 'Je me sens moins malade' }
		chatGoMock.mockResolvedValue(JSON.stringify(divergent))
		vi.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
			const href = String(url?.url ?? url)
			if (href.includes('oauth2.googleapis.com')) {
				return new Response(JSON.stringify({ access_token: 'fake-token' }), { status: 200 })
			}
			return new Response(fakeGeminiCandidate(divergent), { status: 200 })
		})

		const result = await geminiTranslateAll('je me sens moins malade')

		expect(result.kh).toBe('បងមិនសូវអីទេ') // jamais le texte source recopié dans le champ khmer
		expect(result.en).toBe('I feel less sick')
	})
})

describe('geminiTranslateAll — secours Go (kimi-k3) avant Gemini', () => {
	const bonne = { lang: 'fr', terms: [], en: 'buttons', kh: 'ប៊ូតុង', fr: 'boutons' }
	const corrompue = { lang: 'fr', terms: [], en: 'buttons', kh: 'បុortonexus', fr: 'boutons' }

	it('GLM rejeté par un garde-fou : le 2e modèle Go répond, Gemini jamais appelé', async () => {
		goFallbackMock.mockReturnValue('kimi-k3')
		chatGoMock.mockResolvedValueOnce(JSON.stringify(corrompue)).mockResolvedValueOnce(JSON.stringify(bonne))
		const fetchSpy = vi.spyOn(global, 'fetch')

		const result = await geminiTranslateAll('boutons')

		expect(result.kh).toBe('ប៊ូតុង')
		expect(fetchSpy).not.toHaveBeenCalled()
		expect(chatGoMock).toHaveBeenCalledTimes(2)
		expect(chatGoMock.mock.calls[1][3]).toBe('kimi-k3')
		expect(logTranslationIssueMock.mock.calls[0][0]).toMatchObject({ reason: 'glued_latin', engine: 'glm' })
	})

	it('GLM en panne technique : le 2e modèle Go prend le relais, Gemini jamais appelé', async () => {
		goFallbackMock.mockReturnValue('kimi-k3')
		chatGoMock.mockRejectedValueOnce(new Error('GLM 503')).mockResolvedValueOnce(JSON.stringify(bonne))
		const fetchSpy = vi.spyOn(global, 'fetch')

		const result = await geminiTranslateAll('boutons')

		expect(result.kh).toBe('ប៊ូតុង')
		expect(fetchSpy).not.toHaveBeenCalled()
		expect(chatGoMock.mock.calls[1][3]).toBe('kimi-k3')
	})

	it('les deux modèles Go rejetés : escalade vers Gemini fort', async () => {
		goFallbackMock.mockReturnValue('kimi-k3')
		chatGoMock.mockResolvedValue(JSON.stringify(corrompue))
		vi.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
			const href = String(url?.url ?? url)
			if (href.includes('oauth2.googleapis.com')) return new Response(JSON.stringify({ access_token: 'fake-token' }), { status: 200 })
			return new Response(fakeGeminiCandidate(bonne), { status: 200 })
		})

		const result = await geminiTranslateAll('boutons')

		expect(result.kh).toBe('ប៊ូតុង') // version Gemini, jamais la corruption
		expect(chatGoMock).toHaveBeenCalledTimes(2) // GLM puis kimi, pas de 3e appel Go
	})
})
