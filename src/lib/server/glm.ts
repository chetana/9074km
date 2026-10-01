import { env } from '$env/dynamic/private'

/**
 * Adaptateur OpenCode Go (GLM-5.3-flash) pour les traductions du couple.
 *
 * Pourquoi : même qualité de registre khmer que gemini-3.6-flash pour ~1/10 du prix,
 * via la souscription OpenCode Go déjà payée. Endpoint OpenAI-compatible :
 *   https://opencode.ai/zen/go/v1/chat/completions
 * Un header x-opencode-session stable par "conversation" optimise le prompt caching
 * (obligatoire — l'API refuse la requête sans).
 *
 * Consommation : ~40 msg/jour de chat → ~$0.5-1/mois équivalent, bruit face au volume
 * opencode perso (~$28/sem). Si saturation un jour → env GLM_ENABLED=0 sur la box
 * (ou ne rien faire : le fallback Gemini prend automatiquement le relais sur erreur).
 */

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

/** Appel brut Go avec relance sur MAX_TOKENS (mêmes garde-fous que geminiRequest). */
export async function chatGo(
	system: string,
	user: string,
	maxTokens = 300,
	model: string = GLM_MODEL
): Promise<string> {
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
