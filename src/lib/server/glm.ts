import { env } from '$env/dynamic/private'

/**
 * Adaptateur ClinePass (via l'API Cline) — moteur principal des traductions du couple.
 *
 * Pourquoi : l'abonnement ClinePass ($9.99/mois) inclut les MÊMES modèles que
 * l'abonnement OpenCode Go (glm-5.3-flash, kimi-k3…) avec un quota 2-5x. On l'utilise
 * en premier, OpenCode Go prend le relais sur échec, puis Gemini (payant à l'usage).
 * Endpoint OpenAI-compatible documenté (docs.cline.bot/api) :
 *   POST https://api.cline.bot/api/v1/chat/completions   (Authorization: Bearer CLINE_API_KEY)
 * Modèle : slug complet `cline-pass/glm-5.3-flash`. stream:false obligatoire ici.
 * Activation : CLINE_ENABLED=1 + CLINE_API_KEY sur la box (env/lys.env).
 */

const CLINE_URL = 'https://api.cline.bot/api/v1/chat/completions'
export const CLINE_MODEL = 'cline-pass/glm-5.3-flash'
const CLINE_CEILING = 8192

export function clineEnabled(): boolean {
	return env.CLINE_ENABLED === '1' && !!env.CLINE_API_KEY
}

/** Appel ClinePass brut, même contrat que chatGo (relance sur sortie tronquée). */
export async function chatCline(system: string, user: string, maxTokens = 300): Promise<string> {
	if (!env.CLINE_API_KEY) throw new Error('CLINE_API_KEY manquant')

	let budget = Math.min(CLINE_CEILING, Math.max(4096, maxTokens))
	let lastError: Error | null = null
	for (let attempt = 0; attempt < 3; attempt++) {
		const res = await fetch(CLINE_URL, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${env.CLINE_API_KEY}`,
				'Content-Type': 'application/json',
				'X-Title': 'lys.chetana.fr',
			},
			body: JSON.stringify({
				model: CLINE_MODEL,
				messages: [
					{ role: 'system', content: system },
					{ role: 'user', content: user },
				],
				temperature: 0.2,
				max_tokens: budget,
				stream: false,
			}),
		})
		const data = await res.json() as any
		if (!res.ok) {
			console.warn(`[cline] échec ${res.status}: ${data?.error?.message ?? data?.message ?? 'inconnu'}`)
			lastError = new Error(`Cline ${res.status}: ${data?.error?.message ?? data?.message ?? 'inconnu'}`)
			break
		}
		// L'API Cline encapsule la réponse : { data: { choices: [...] } } (≠ format OpenAI brut)
		const choice = data?.choices?.[0] ?? data?.data?.choices?.[0]
		if (choice?.finish_reason === 'length' && budget < CLINE_CEILING) {
			const bumped = Math.min(CLINE_CEILING, Math.max(budget * 2, 2048))
			console.warn(`[cline] sortie tronquée (budget ${budget}) → relance à ${bumped}`)
			budget = bumped
			continue
		}
		const raw: string = choice?.message?.content ?? '{}'
		return raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
	}
	throw lastError ?? new Error('ClinePass a échoué')
}

const GO_URL = 'https://opencode.ai/zen/go/v1/chat/completions'
const GLM_MODEL = 'glm-5.3-flash'
const MAX_OUTPUT_CEILING = 8192

// Directives d'adaptation GLM : déplacées dans khmer-guards.ts (module pur) le 24/09/2026 pour que
// scripts/eval-translate.mjs teste enfin le prompt EXACT de prod — il envoyait le prompt sans elles.
export { GLM_ADAPT } from './khmer-guards'

export function glmEnabled(): boolean {
	return env.GLM_ENABLED === '1' && !!env.OPENCODE_API_KEY
}

// Modèle de SECOURS dans le même abonnement Go, essayé avant Gemini (payant à l'usage). Choisi au
// banc du 01/10/2026 (scripts/bench-go-models.mjs, 31 cas réels, prompt de prod) : kimi-k3 31/31
// sans escalade, 9 s ; mimo-v2.6-flash 31/31 mais 15 s ; qwen3.8-flash 21/31, deepseek-v4.1-flash
// 26/31 ; minimax-m3 et gpt-6-luna incompatibles avec ce format. GO_FALLBACK_MODEL=0 désactive.
const DEFAULT_GO_FALLBACK = 'kimi-k3'
export function goFallbackModel(): string | null {
	const m = env.GO_FALLBACK_MODEL ?? DEFAULT_GO_FALLBACK
	return glmEnabled() && m && m !== '0' && m !== GLM_MODEL ? m : null
}

/** Appel brut Go avec relance sur MAX_TOKENS (mêmes garde-fous que geminiRequest).
 * ClinePass est essayé en premier sur le modèle par défaut (même glm-5.3-flash, quota
 * d'abonnement ClinePass) — sur échec, OpenCode Go prend le relais sans rien changer
 * pour l'appelant, puis Gemini en dernier recours côté appelant. */
export async function chatGo(
	system: string,
	user: string,
	maxTokens = 300,
	model: string = GLM_MODEL
): Promise<string> {
	if (model === GLM_MODEL && clineEnabled()) {
		try {
			return await chatCline(system, user, maxTokens)
		} catch (e) {
			console.warn(`[glm] ClinePass KO (${(e as Error).message}) → OpenCode Go`)
		}
	}
	if (!env.OPENCODE_API_KEY) throw new Error('OPENCODE_API_KEY manquant')

	let budget = Math.min(MAX_OUTPUT_CEILING, Math.max(4096, maxTokens))
	// Budget plancher 4096 : les traductions JSON {fr,en,kh,lang} + tokens de raisonnement
	// dépassent régulièrement 1024 → à 1024 chaque appel tronquait et re-quotait (2x latence).
	// reasoning_effort=low : glm-5.3-flash raisonne par défaut (~300 tokens cachés) → low divise
	// la latence sans dégrader le khmer (validé protocole 10/10 — le registre tactique survivra).
	let lastError: Error | null = null
	for (let attempt = 0; attempt < 3; attempt++) {
		const res = await fetch(GO_URL, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${env.OPENCODE_API_KEY}`,
				'Content-Type': 'application/json',
				'x-opencode-session': model === GLM_MODEL ? 'lys-couple-translate' : `lys-couple-translate-${model}`,
			},
			body: JSON.stringify({
				model,
				messages: [
					{ role: 'system', content: system },
					{ role: 'user', content: user },
				],
				temperature: 0.2,
				max_tokens: budget,
				reasoning_effort: 'low',
			}),
		})
		const data = await res.json() as any
		if (!res.ok) {
			// Quota saturé / indispo → on veut laisser le fallback Gemini prendre la main
			console.warn(`[glm] échec ${res.status}: ${data?.error?.message ?? 'inconnu'}`)
			lastError = new Error(`GLM ${res.status}: ${data?.error?.message ?? 'inconnu'}`)
			break
		}
		const choice = data?.choices?.[0]
		if (choice?.finish_reason === 'length' && budget < MAX_OUTPUT_CEILING) {
			const bumped = Math.min(MAX_OUTPUT_CEILING, Math.max(budget * 2, 2048))
			console.warn(`[glm] sortie tronquée (budget ${budget}) → relance à ${bumped}`)
			budget = bumped
			continue
		}
		const raw: string = choice?.message?.content ?? '{}'
		return raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
	}
	throw lastError ?? new Error('GLM a échoué')
}
