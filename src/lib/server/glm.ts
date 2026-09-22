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

/**
 * Directives d'adaptation GLM — dérivées de l'A/B réel GLM vs Gemini-3.6 (scripts/glm-prompt-v2.mjs,
 * messages réels du couple). Sans elles, GLM traduit trop littéralement et ajoute des mots
 * absents du source ("ឥឡូវនេះ", vocatif "អូន"...) ; avec elles il adopte le lexique khmer oral
 * naturel du couple (ហត់/ធូរ/តោះ/អរហ្នឹង) comme Gemini. C'est ce qui transformerait un modèle
 * "traducteur" en adaptateur. Lexque issu des sorties réelles de Gemini-3.6 (référence validée).
 *
 * Le lexique, l'anti-inversion de sens et l'anti-latin-collé vivent désormais UNIQUEMENT dans le
 * prompt partagé (vertex.ts) — retirés d'ici le 22/09 pour ne plus les répéter deux fois avec des
 * formulations différentes (source de confusion pour un petit modèle). Ce bloc ne garde que ce qui
 * est spécifique à l'A/B GLM lui-même.
 */
export const GLM_ADAPT = `
- Tu n'es PAS Google Translate : adapte le SENS INTENTIONNÉ du message, comme l'écrirait un khmer natif du couple, au naturel.
- CORRIGE d'abord les fautes/tournures du français source avant de traduire — ne traduis jamais les maladresses lettre à lettre.
- N'AJOUTE AUCUN mot absent du message source : pas de "ឥឡូវនេះ"(maintenant), pas de vocatif "អូន"/"បង"/"ម៉ែ" qui ne serait pas dans le français, aucun titre inventé type "ទឹកមុត".
- Vocabulaire khmer ORAL à privilégier (registre couple, Phnom Penh) : "aller" → "តោះ" ; "être fatigué" → "ហត់" (réserve "អស់កម្លាំង" au sens physique fort) ; "ça va mieux" → "ធូរជាងមុន" ; "content de savoir" → "អរហ្នឹង".
- Le message traduit doit sonner comme si le couple lui-même écrivait en khmer, pas comme du français traduit.
`

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
