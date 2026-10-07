// Moteurs GLM : ClinePass d'abord, OpenCode Go en repli. Le 07/10/2026 l'abonnement OpenCode Go a
// été désactivé au profit de ClinePass : la chaîne doit marcher avec ClinePass SEUL (sans clé
// OpenCode), et le modèle de secours (kimi-k3) doit passer par ClinePass, pas par Go.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { fakeEnv } = vi.hoisted(() => ({ fakeEnv: {} as Record<string, string | undefined> }))
vi.mock('$env/dynamic/private', () => ({ env: fakeEnv }))

import { chatGo, glmEnabled, goFallbackModel } from './glm'

const ok = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }] }), { status: 200 })

beforeEach(() => {
	for (const k of Object.keys(fakeEnv)) delete fakeEnv[k]
	vi.restoreAllMocks()
})

describe('moteurs GLM sans abonnement OpenCode Go', () => {
	it('glmEnabled : ClinePass seul suffit (pas de clé OpenCode)', () => {
		Object.assign(fakeEnv, { GLM_ENABLED: '1', CLINE_ENABLED: '1', CLINE_API_KEY: 'k' })
		expect(glmEnabled()).toBe(true)
	})

	it('glmEnabled : désactivé sans aucune clé', () => {
		Object.assign(fakeEnv, { GLM_ENABLED: '1' })
		expect(glmEnabled()).toBe(false)
	})

	it('modèle de secours : appelé sur ClinePass avec le slug cline-pass/<modèle>, Go jamais contacté', async () => {
		Object.assign(fakeEnv, { GLM_ENABLED: '1', CLINE_ENABLED: '1', CLINE_API_KEY: 'k' })
		const spy = vi.spyOn(global, 'fetch').mockImplementation(async () => ok('{"kh":"x"}'))

		const out = await chatGo('sys', 'user', 300, 'kimi-k3')

		expect(out).toBe('{"kh":"x"}')
		expect(spy).toHaveBeenCalledTimes(1)
		expect(String(spy.mock.calls[0][0])).toContain('api.cline.bot')
		expect(JSON.parse(String(spy.mock.calls[0][1]?.body)).model).toBe('cline-pass/kimi-k3')
	})

	it('ClinePass en échec et pas de clé OpenCode : l\'erreur ClinePass remonte (pas « OPENCODE_API_KEY manquant »)', async () => {
		Object.assign(fakeEnv, { GLM_ENABLED: '1', CLINE_ENABLED: '1', CLINE_API_KEY: 'k' })
		vi.spyOn(global, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ error: { message: 'boom' } }), { status: 500 }))

		await expect(chatGo('sys', 'user')).rejects.toThrow(/Cline 500/)
	})

	it('ClinePass en échec avec clé OpenCode valide : repli sur Go', async () => {
		Object.assign(fakeEnv, { GLM_ENABLED: '1', CLINE_ENABLED: '1', CLINE_API_KEY: 'k', OPENCODE_API_KEY: 'o' })
		const spy = vi.spyOn(global, 'fetch').mockImplementation(async (url: any) =>
			String(url).includes('api.cline.bot') ? new Response('{}', { status: 500 }) : ok('{"kh":"y"}'))

		expect(await chatGo('sys', 'user')).toBe('{"kh":"y"}')
		expect(spy.mock.calls.some(c => String(c[0]).includes('opencode.ai'))).toBe(true)
	})

	it('goFallbackModel : kimi-k3 par défaut avec ClinePass seul, GO_FALLBACK_MODEL=0 le coupe', () => {
		Object.assign(fakeEnv, { GLM_ENABLED: '1', CLINE_ENABLED: '1', CLINE_API_KEY: 'k' })
		expect(goFallbackModel()).toBe('kimi-k3')
		fakeEnv.GO_FALLBACK_MODEL = '0'
		expect(goFallbackModel()).toBeNull()
	})
})
