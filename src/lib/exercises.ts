// Types d'exercices partagés serveur ⇄ client pour le moteur d'apprentissage.
// Les leçons sont générées par Gemini à partir du squelette CURRICULUM (curriculum.ts).
// Langue cible = français. L1 (langue maternelle de l'apprenant) = khmer pour Lys.

export type ExerciseType = 'mcq' | 'listen' | 'fill' | 'order' | 'translate'

/** QCM de compréhension/grammaire : question en L1, options + bonne réponse. */
export interface McqExercise {
	type: 'mcq'
	q: string            // question (en L1)
	options: string[]    // 3-4 choix
	answer: number       // index de la bonne réponse
	explain: string      // explication (en L1)
}

/** Écoute : on entend une phrase française (TTS), on choisit son sens parmi des options L1. */
export interface ListenExercise {
	type: 'listen'
	audio: string        // phrase FRANÇAISE jouée par la TTS
	options: string[]    // sens proposés (en L1)
	answer: number
	explain: string
}

/** Texte à trou (grammaire) : phrase française avec un blanc à compléter. */
export interface FillExercise {
	type: 'fill'
	before: string       // début de phrase (FR)
	after: string        // fin de phrase (FR)
	options: string[]    // formes proposées (FR)
	answer: number
	explain: string      // pourquoi cette forme (en L1)
}

/** Remettre les mots dans l'ordre pour former une phrase française correcte. */
export interface OrderExercise {
	type: 'order'
	tokens: string[]     // mots FR mélangés
	answer: string       // phrase FR correcte (référence)
	hint: string         // sens de la phrase (en L1)
}

/** Production écrite : traduire une phrase L1 → français. Corrigé par Gemini. */
export interface TranslateExercise {
	type: 'translate'
	prompt: string       // phrase à traduire (en L1)
	expected: string     // traduction modèle (FR) — référence pour la correction
	explain: string      // point clé (en L1)
}

export type Exercise = McqExercise | ListenExercise | FillExercise | OrderExercise | TranslateExercise

export interface Lesson {
	unitId: string
	intro: string        // mini-explication grammaticale en L1 (avec exemples FR)
	exercises: Exercise[]
	generatedAt?: string
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Normalise pour comparaison tolérante (casse, accents, ponctuation, espaces). */
export function normalizeAnswer(s: string): string {
	return s
		.normalize('NFD').replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[.,!?;:'"()«»]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
}

export function sameSentence(a: string, b: string): boolean {
	return normalizeAnswer(a) === normalizeAnswer(b)
}

export function shuffle<T>(arr: T[]): T[] {
	const a = [...arr]
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1))
		;[a[i], a[j]] = [a[j], a[i]]
	}
	return a
}
