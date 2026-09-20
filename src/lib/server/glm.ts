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
// Session stable (et non par message) : tout le système-prompt + contexte couple reste
// en cache lecture côté Go ($0.03/M) → coût de chaque appel quasi nul.
const SESSION_ID = 'lys-couple-translate'

export function glmEnabled(): boolean {
	return env.GLM_ENABLED === '1' && !!env.OPENCODE_API_KEY
}

/** Appel brut Go avec relance sur MAX_TOKENS (mêmes garde-fous que geminiRequest). */
export async function chatGo(
	system: string,
	user: string,
	maxTokens = 300
): Promise<string> {
	if (!env.OPENCODE_API_KEY) throw new Error('OPENCODE_API_KEY manquant')

	let budget = Math.min(MAX_OUTPUT_CEILING, maxTokens)
	let lastError: Error | null = null
	for (let attempt = 0; attempt < 3; attempt++) {
		const res = await fetch(GO_URL, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${env.OPENCODE_API_KEY}`,
				'Content-Type': 'application/json',
				'x-opencode-session': 'lys-couple-translate',
			},
			body: JSON.stringify({
				model: GLM_MODEL,
				messages: [
					{ role: 'system', content: system },
					{ role: 'user', content: user },
				],
				temperature: 0.2,
				max_tokens: budget,
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
