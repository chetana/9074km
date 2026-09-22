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
vi.mock('./glm', () => ({
	glmEnabled: () => glmEnabledMock(),
	chatGo: (system: string, user: string, maxTokens?: number) => chatGoMock(system, user, maxTokens),
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
})
