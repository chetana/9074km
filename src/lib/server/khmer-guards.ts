// Fonctions PURES du pipeline de traduction (validation de forme, détection de corruption,
// nettoyage) — extraites de vertex.ts le 22/09/2026 pour être testables avec Vitest sans dépendre
// de `$env/dynamic/private` (module virtuel SvelteKit, indisponible hors du pipeline Vite/Kit).
// Zéro appel réseau ici, zéro accès à `env` : tout est testable en donnant juste des chaînes.

export interface Translations { fr: string; en: string; kh: string; lang?: string }
export interface TranslateTerm { src: string; kh: string }
export interface LessonItem { original: string; corrected: string; explanation: string }
export interface GeminiSuggestion {
	corrected: string; fr: string; en: string; kh: string; lang: string; question: string; lessons?: LessonItem[]
}

export const MAX_OUTPUT_CEILING = 8192

// Budget de sortie proportionnel à l'entrée : une traduction en 3 langues (dont le khmer,
// gourmand en tokens) fait ~1 token de sortie par caractère d'entrée ; on prend large.
export function translateBudget(text: string, factor = 4): number {
	return Math.min(MAX_OUTPUT_CEILING, Math.max(1024, Math.ceil(text.length * factor)))
}

// Découpe un texte long aux frontières de phrase (fr/en/kh), morceaux <= maxLen.
export function splitIntoChunks(text: string, maxLen: number): string[] {
	if (text.length <= maxLen) return [text]
	const sentences = text.match(/[^.!?…។\n]+[.!?…។\n]*/g) ?? [text]
	const chunks: string[] = []
	let cur = ''
	for (const s of sentences) {
		if (cur && cur.length + s.length > maxLen) { chunks.push(cur); cur = '' }
		if (s.length > maxLen) {
			if (cur) { chunks.push(cur); cur = '' }
			for (let i = 0; i < s.length; i += maxLen) chunks.push(s.slice(i, i + maxLen))
		} else {
			cur += s
		}
	}
	if (cur) chunks.push(cur)
	return chunks
}

// Le khmer et le thaï se ressemblent : les petits modèles glissent parfois vers le thaï.
// Scripts qui n'ont RIEN à faire dans un texte khmer et déclenchent un re-roll sur le modèle fort.
// Couvre : thaï, indien (devanagari/bengali/tamoul), chinois+japonais (CJK+kana), coréen (hangul),
// arabe, cyrillique, hébreu. Le khmer (U+1780–17FF), le latin, les chiffres, la ponctuation et les
// emoji restent autorisés.
export const FOREIGN_SCRIPT =
	/[฀-๿ऀ-ॿঀ-৿஀-௿一-鿿㐀-䶿぀-ヿ가-힯ᄀ-ᇿ؀-ۿЀ-ӿ֐-׿]/
export function containsForeignScript(s?: string): boolean {
	return FOREIGN_SCRIPT.test(s ?? '')
}

// Corruption détectée le 22/09/2026 sur "boutons" → "បុortonexus" : du latin collé
// SANS espace à du khmer (signature d'un mot halluciné/tronqué en cours de génération).
// Un vrai nom propre latin dans une phrase khmère est toujours séparé par une espace
// ("iPhone", "WhatsApp") — cette adjacence directe khmer↔latin n'arrive jamais en usage normal.
export const GLUED_LATIN = /[ក-៿][A-Za-z]{2,}|[A-Za-z]{2,}[ក-៿]/
export function containsGluedLatin(s?: string): boolean {
	return GLUED_LATIN.test(s ?? '')
}

// Retire les gloses de romanisation latine insérées à tort dans le khmer (ex "កែ (kê)" → "កែ").
// Ne matche que des parenthèses ne contenant QUE du latin/ponctuation (jamais du khmer).
export function cleanKhmer(kh?: string): string {
	return (kh ?? '')
		.replace(/\s*[（(][A-Za-zÀ-ÿ0-9'’ .,:;\/-]+[)）]/g, '')
		.replace(/[ \t]{2,}/g, ' ')
		.trim()
}

// Détection de l'auteur pour l'accord de pronom (បង/អូន) — NFD pour matcher "Chétana" (accent
// composé) comme "Chetana". null = auteur inconnu (aucun accord forcé).
export function detectIsChet(author?: string): boolean | null {
	if (!author) return null
	const normalized = author.normalize('NFD').replace(/[̀-ͯ]/g, '')
	return /^(chet|chetana)$/i.test(normalized)
}

// Validation de forme : rejette un JSON qui a l'air valide mais qui ne l'est pas — champ
// manquant/vide, placeholder du schéma recopié tel quel, ou kh identique à fr/en (non-traduction).
// Pick explicite des clés : n'importe quelle clé en plus renvoyée par le modèle est ignorée.
export function pickTranslation(raw: string): Translations & { terms: TranslateTerm[] } {
	const t = JSON.parse(raw)
	if (typeof t.kh !== 'string' || !t.kh.trim()) throw new Error('champ kh manquant/vide')
	if (typeof t.fr !== 'string' || !t.fr.trim()) throw new Error('champ fr manquant/vide')
	if (typeof t.en !== 'string' || !t.en.trim()) throw new Error('champ en manquant/vide')
	if (t.kh === 'អត្ថបទជាភាសាខ្មែរ' || t.fr === 'texte en français' || t.en === 'text in English') {
		throw new Error('placeholder du schéma recopié tel quel')
	}
	if (t.kh === t.fr || t.kh === t.en) throw new Error('kh identique à fr/en — probable non-traduction')
	const lang = t.lang === 'fr' || t.lang === 'en' || t.lang === 'kh' ? t.lang : ''
	const terms: TranslateTerm[] = Array.isArray(t.terms)
		? t.terms.filter((x: any) => x && typeof x.src === 'string' && typeof x.kh === 'string')
		: []
	return { fr: t.fr, en: t.en, kh: t.kh, lang, terms }
}

export function pickSuggestion(raw: string): GeminiSuggestion & { terms: TranslateTerm[] } {
	const s = JSON.parse(raw)
	if (typeof s.kh !== 'string' || !s.kh.trim()) throw new Error('champ kh manquant/vide')
	if (typeof s.fr !== 'string' || !s.fr.trim()) throw new Error('champ fr manquant/vide')
	if (typeof s.en !== 'string' || !s.en.trim()) throw new Error('champ en manquant/vide')
	if (typeof s.corrected !== 'string' || !s.corrected.trim()) throw new Error('champ corrected manquant/vide')
	if (s.kh === 'អត្ថបទជាភាសាខ្មែរ' || s.fr === 'texte en français' || s.en === 'text in English') {
		throw new Error('placeholder du schéma recopié tel quel')
	}
	const lang = s.lang === 'fr' || s.lang === 'en' || s.lang === 'kh' ? s.lang : ''
	const terms: TranslateTerm[] = Array.isArray(s.terms)
		? s.terms.filter((x: any) => x && typeof x.src === 'string' && typeof x.kh === 'string')
		: []
	const lessons = Array.isArray(s.lessons) ? s.lessons as LessonItem[] : undefined
	return { corrected: s.corrected, fr: s.fr, en: s.en, kh: s.kh, lang, question: s.question ?? '', lessons, terms }
}

// Si le modèle s'est engagé sur un terme difficile (glossaire), sa traduction annoncée doit
// réapparaître dans le khmer final — sinon c'est le signe d'une génération qui a divergé en route.
export function termsEchoed(t: { kh: string; terms: TranslateTerm[] }): boolean {
	return t.terms.every(term => term.kh && t.kh.includes(term.kh))
}

// Glossaire cible UNIQUEMENT (jamais les formes fautives) : un petit modèle a du mal à pondérer
// une négation ("jamais X") — une chaîne présente dans le prompt devient plus probable en sortie,
// pas moins. La détection des formes fautives est le rôle du code (containsForeignScript,
// containsGluedLatin, termsEchoed), pas du prompt. Revu le 22/09 suite à une revue de prompt.
export const GLOSSARY_LINES = `- allergie/allergique → អាលែកហ្ស៊ី
- sésame → ល្ង
- acidulé/aigre (goût) → ជូរ
- bleu (couleur) → ខៀវ
- "il faut que" (obligation) → ត្រូវ / ត្រូវតែ (jamais "បាត់បង់" qui veut dire "perdre")
- "mes/tes parents" (registre oral, intime) → ប៉ាម៉ាក់ (jamais "មាតាបិតា", trop formel/littéraire — réservé aux textes officiels)`
