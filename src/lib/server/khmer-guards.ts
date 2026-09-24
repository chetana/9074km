// Fonctions PURES du pipeline de traduction (validation de forme, détection de corruption,
// nettoyage) — extraites de vertex.ts le 22/09/2026 pour être testables avec Vitest sans dépendre
// de `$env/dynamic/private` (module virtuel SvelteKit, indisponible hors du pipeline Vite/Kit).
// Zéro appel réseau ici, zéro accès à `env` : tout est testable en donnant juste des chaînes.

export interface Translations { fr: string; en: string; kh: string; lang?: string }
// fr/en optionnels : utilisés uniquement pour un terme dont la SOURCE est en khmer (glossaire
// GLOSSARY_KH_LINES) — le modèle s'engage alors aussi sur le rendu fr/en avant de rédiger.
export interface TranslateTerm { src: string; kh: string; fr?: string; en?: string }
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
			.map((x: any) => ({ src: x.src, kh: x.kh, fr: typeof x.fr === 'string' ? x.fr : undefined, en: typeof x.en === 'string' ? x.en : undefined }))
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
			.map((x: any) => ({ src: x.src, kh: x.kh, fr: typeof x.fr === 'string' ? x.fr : undefined, en: typeof x.en === 'string' ? x.en : undefined }))
		: []
	const lessons = Array.isArray(s.lessons) ? s.lessons as LessonItem[] : undefined
	return { corrected: s.corrected, fr: s.fr, en: s.en, kh: s.kh, lang, question: s.question ?? '', lessons, terms }
}

// Si le modèle s'est engagé sur un terme difficile (glossaire), sa traduction khmère annoncée doit
// réapparaître dans le khmer final — sinon c'est le signe d'une génération qui a divergé en route.
// Un terme à trous ("ចាប់ផ្ដើម...ឡើងវិញ", notation reprise du glossaire) est vérifié morceau par
// morceau, un terme à alternatives ("ឡេវ / គ្រាប់ឡេវ") passe si l'une d'elles est présente, et un
// terme dont le `src` n'est pas dans le message source (inventé par le modèle) est ignoré.
// term.fr/term.en ne sont PAS vérifiés : le modèle y écrit une glose à variantes ("doué / fort")
// qui n'apparaît jamais telle quelle. Mesuré au banc le 24/09/2026 : la version stricte faisait
// escalader à tort ~1 traduction correcte sur 4. Le rendu fr/en imposé est vérifié par glossaryEchoed.
export function termsEchoed(t: { kh: string; terms: TranslateTerm[] }, sourceText?: string): boolean {
	const source = sourceText?.toLowerCase()
	return t.terms.every(term => {
		if (source !== undefined && !source.includes(term.src.toLowerCase())) return true
		return term.kh.split(/\s+\/\s+/).some(alt => {
			const parts = alt.split(/\.{2,}|…/).map(p => p.trim()).filter(Boolean)
			return parts.length > 0 && parts.every(p => t.kh.includes(p))
		})
	})
}

// Glossaire structuré — 24/09/2026 : avant, un simple bloc de texte (GLOSSARY_LINES) que seul
// termsEchoed vérifiait, ET seulement si le modèle CHOISISSAIT d'annoncer le terme dans `terms[]`.
// Bug réel trouvé le 24/09 : "ma chérie" collé à une salutation/heure ("Bonjour ma chérie... vers
// 22h") faisait halluciner le khmer un mot sur deux (ចង្អុរ/ច្បាស់/ចង្អុល...) sans que le modèle
// n'annonce jamais de terme difficile pour "chérie" — rien ne le détectait. `glossaryEchoed` lit
// la SOURCE directement (déterministe, ne dépend plus du modèle) en complément de termsEchoed.
//
// Chaque entrée cible UNIQUEMENT la forme correcte (jamais une forme fautive à éviter — un petit
// modèle pondère mal une négation, la chaîne présente dans le prompt devient plus probable en
// sortie, pas moins). `kh`/`fr`/`en` sont les regex de vérification ; une entrée sans l'un de ces
// champs n'est pas vérifiable mécaniquement et reste documentaire (prompt seul), comme "il faut
// que" et "mes/tes parents" dont le rendu cible est trop fréquent en khmer pour servir de garde-fou
// sans faux positifs massifs.
export interface GlossaryEntry {
	line: string           // texte affiché dans le prompt
	src: RegExp             // détecte le terme dans le message SOURCE
	kh?: RegExp             // motif attendu dans la sortie khmère
	fr?: RegExp             // motif attendu dans la sortie française (glossaire khmer→fr/en)
	en?: RegExp             // motif attendu dans la sortie anglaise
	authorIsChet?: boolean  // undefined = les deux ; true = Chet seulement ; false = Lys seulement
	direction?: 'fromKh'    // absent = fr/en→kh (GLOSSARY_LINES) ; 'fromKh' = kh→fr/en (GLOSSARY_KH_LINES)
	// Motifs INTERDITS en sortie, vérifiés par le code uniquement (jamais affichés au modèle — une
	// forme fautive citée dans le prompt devient plus probable, pas moins).
	avoid?: { kh?: RegExp; fr?: RegExp; en?: RegExp }
}

export const GLOSSARY: GlossaryEntry[] = [
	{ line: '- allergie/allergique → អាលែកហ្ស៊ី', src: /allergi/i, kh: /អាលែកហ្ស៊ី/ },
	{ line: '- sésame → ល្ង', src: /\bs[ée]same\b/i, kh: /ល្ង/ },
	{ line: '- acidulé/aigre (goût) → ជូរ', src: /acidul[ée]|aigre/i, kh: /ជូរ/ },
	{ line: '- bleu (couleur) → ខៀវ', src: /\bbleue?s?\b/i, kh: /ខៀវ/ },
	{ line: '- "il faut que" (obligation) → ត្រូវ / ត្រូវតែ (jamais "បាត់បង់" qui veut dire "perdre")', src: /il faut que/i },
	{ line: '- "mes/tes parents" (registre oral, intime) → ប៉ាម៉ាក់ (jamais "មាតាបិតា", trop formel/littéraire — réservé aux textes officiels)', src: /\b(mes|tes) parents\b/i },
	{
		line: '- "ma chérie"/"mon amour"/"mon cœur"/"bébé" (Chet → Lys) → អូន ou អូនសម្លាញ់ ; "Bonjour ma chérie" → សួស្តីអូនសម្លាញ់ (le mot tendre FUSIONNE avec le pronom, jamais un mot séparé)',
		src: /\bma ch[ée]rie\b|\bmon amour\b|\bmon c(?:oe|œ)ur\b|\bb[ée]b[ée]\b/i, kh: /អូន(សម្លាញ់)?/, authorIsChet: true,
	},
	{
		line: '- "mon chéri"/"mon amour"/"mon cœur" (Lys → Chet) → បង ou បងសម្លាញ់ ; "Bonjour mon chéri" → សួស្តីបងសម្លាញ់ (le mot tendre FUSIONNE avec le pronom, jamais un mot séparé)',
		src: /\bmon ch[ée]ri\b|\bmon amour\b|\bmon c(?:oe|œ)ur\b/i, kh: /បង(សម្លាញ់)?/, authorIsChet: false,
	},
	{
		// Même `line` que l'entrée précédente (dédupliquée dans GLOSSARY_LINES, n'affiche rien en
		// plus au modèle) — check machine plus strict spécifique à la salutation collée, seul cas
		// où le check générique ci-dessus (អូន présent QUELQUE PART) ne suffit pas : le bug réel du
		// 24/09 laisse "អូន" présent dans le khmer, mais précédé d'un mot inventé collé à "សួស្តី".
		line: '- "ma chérie"/"mon amour"/"mon cœur"/"bébé" (Chet → Lys) → អូន ou អូនសម្លាញ់ ; "Bonjour ma chérie" → សួស្តីអូនសម្លាញ់ (le mot tendre FUSIONNE avec le pronom, jamais un mot séparé)',
		// Pas de \b après l'alternation khmère : \b n'a de sens qu'entre un caractère \w (ASCII) et
		// un non-\w — deux syllabes khmères adjacentes sans espace ne déclenchent JAMAIS de \b,
		// donc "សួស្តីអូនសម្លាញ់" (collé, cas normal) ne matchait pas avec un \b final.
		src: /\b(bonjour|salut|coucou)\b[^.!?]{0,25}\bma ch[ée]rie\b|\bma ch[ée]rie\b[^.!?]{0,25}\b(bonjour|salut|coucou)\b/i,
		kh: /សួស្តី\s*(អូនសម្លាញ់|អូន)/, authorIsChet: true,
	},
	{
		line: '- "mon chéri"/"mon amour"/"mon cœur" (Lys → Chet) → បង ou បងសម្លាញ់ ; "Bonjour mon chéri" → សួស្តីបងសម្លាញ់ (le mot tendre FUSIONNE avec le pronom, jamais un mot séparé)',
		src: /\b(bonjour|salut|coucou)\b[^.!?]{0,25}\bmon ch[ée]ri\b|\bmon ch[ée]ri\b[^.!?]{0,25}\b(bonjour|salut|coucou)\b/i,
		kh: /សួស្តី\s*(បងសម្លាញ់|បង)/, authorIsChet: false,
	},
	{
		line: '- ប្ដីសម្លាញ់ (mari affectueux) → "mon cher mari" / "my dear husband" (les DEUX idées dans la même expression, jamais juste "chéri" tout seul)',
		src: /ប្ដីសម្លាញ់|ប្តីសម្លាញ់/, fr: /\bmari\b/i, en: /\bhusband\b/i, direction: 'fromKh',
	},
	{
		line: '- ប្រពន្ធសម្លាញ់/ស្រីសម្លាញ់ (femme affectueuse) → "ma chère femme" / "my dear wife" (les DEUX idées dans la même expression)',
		src: /ប្រពន្ធសម្លាញ់|ស្រីសម្លាញ់/, fr: /\bfemme\b/i, en: /\bwife\b/i, direction: 'fromKh',
	},
	// Dérives réelles du 24/09/2026 après-midi (mesurées : "oui" de Chet rendu ចា៎ស 6 fois sur 6,
	// "s'ennuyer" rendu par un mot inventé 5 fois sur 6, phrase de Chet jugée incompréhensible par Lys).
	{ line: '- "oui"/"ouais" dit par Chet → បាទ (le oui masculin)', src: /\boui\b|\bouais\b/i, kh: /បាទ/, avoid: { kh: /ចា៎ស|ចាស/ }, authorIsChet: true },
	{ line: '- "oui"/"ouais" dit par Lys → ចា៎ស (le oui féminin)', src: /\boui\b|\bouais\b/i, kh: /ចា៎ស|ចាស/, avoid: { kh: /បាទ/ }, authorIsChet: false },
	{ line: '- "content(e)" (heureux) → សប្បាយចិត្ត / អរ', src: /\bcontente?s?\b/i, kh: /សប្បាយ|អរ|រីករាយ|ត្រេកអរ/, avoid: { kh: /ស្រលាញ់|ស្រឡាញ់/ } },
	{ line: `- "s'ennuyer" (je ne m'ennuie pas) → ធុញទ្រាន់ / អផ្សុក`, src: /\b[mts]['’]ennui|\bennuy/i, kh: /ធុញ|អផ្សុក/ },
	{ line: '- "courage" (encouragement) → ស៊ូៗ / មានកម្លាំងចិត្ត', src: /\bcourage\b/i, kh: /ស៊ូ|កម្លាំងចិត្ត/ },
	{ line: '- "stress" → ស្ត្រេស / តានតឹង', src: /\bstress/i, kh: /ស្ត្រេស|ស្ទ្រេស|តានតឹង/ },
	{ line: '- "récupérer (mon) énergie / des forces" → អោយមានកម្លាំងឡើងវិញ', src: /r[ée]cup[ée]rer (mon |mes |de l'|des )?(énergie|energie|forces?)/i, kh: /កម្លាំង/, avoid: { kh: /ត្រឡប់កម្លាំង/ } },
	{ line: '- "mais ça va" / "ça va" (pour rassurer) → តែមិនអីទេ / មិនអីទេ', src: /\bmais [çc]a va\b/i, kh: /មិនអីទេ|មិនអី/ },
	{ line: '- "soucis/problèmes au visage" (peau, cernes) → បញ្ហានៅលើមុខ / បញ្ហាស្បែកមុខ', src: /(soucis?|probl[èe]mes?) (au|du|sur le) visage/i, kh: /លើមុខ|ស្បែកមុខ/ },
	{
		line: `- អូនតូច (un bébé / un petit enfant dont on parle) → "le petit" / "the little one" (c'est un NOM, pas le pronom អូន)`,
		// seulement si la source ne dit pas "យើង" (nous/notre) : sinon "notre petit" est légitime
		src: /^(?![\s\S]*យើង)[\s\S]*អូនតូច/, avoid: { fr: /\bnotre\b/i, en: /\bour\b/i }, direction: 'fromKh',
	},
	{ line: '- "arriver à" + verbe (réussir à faire) → verbe + បាន / អោយបាន (marqueur de résultat, un seul verbe)', src: /\barriver [àa]\b/i },
	{ line: `- "se remettre à"/"reprendre" + activité → ចាប់ផ្ដើម…ឡើងវិញ / …ម្ដងទៀត (un seul verbe d\'action, jamais deux verbes empilés)`, src: /\bse remettre [àa]\b|\breprendre\b/i },
]

function uniqueLines(entries: GlossaryEntry[]): string {
	return [...new Set(entries.map(g => g.line))].join('\n')
}
export const GLOSSARY_LINES = uniqueLines(GLOSSARY.filter(g => g.direction !== 'fromKh'))
export const GLOSSARY_KH_LINES = uniqueLines(GLOSSARY.filter(g => g.direction === 'fromKh'))

// Garde-fou de FORME complémentaire à termsEchoed : lit la SOURCE directement (déterministe),
// ne dépend pas du modèle pour choisir d'annoncer un terme dans `terms[]`. `isChet` filtre les
// entrées à sens unique (ex : "ma chérie" seulement quand Chet est l'auteur).
export function glossaryEchoed(sourceText: string, t: { kh: string; fr: string; en: string }, isChet: boolean | null): boolean {
	return GLOSSARY
		.filter(g => g.src.test(sourceText) && (g.authorIsChet === undefined || g.authorIsChet === isChet))
		.every(g => (!g.kh || g.kh.test(t.kh)) && (!g.fr || g.fr.test(t.fr)) && (!g.en || g.en.test(t.en))
			&& !(g.avoid?.kh?.test(t.kh) || g.avoid?.fr?.test(t.fr) || g.avoid?.en?.test(t.en)))
}

// Bug réel du 24/09/2026 : "je suis content" traduit "បងស្រលាញ់អូនណាស់" (je t'aime très fort), et
// "darling" ajouté en anglais sans mot tendre dans la phrase de Chet. Ne s'applique qu'à une source
// fr/en : en khmer, interpeller l'autre par អូន/បង est un registre normal, pas un ajout de sens.
const SRC_TENDER = /ch[ée]ri|\bamour|\bc(?:oe|œ)ur\b|\bb[ée]b[ée]\b|\bdarling|\blove\b|\bhoney|\bsweet|\bmari\b|\bma femme/i
const SRC_LOVE = /aim|love|ador|amour/i
export function tendernessAdded(sourceText: string, t: { kh: string; fr: string; en: string }): boolean {
	if (/[ក-៿]/.test(sourceText)) return false
	if (!SRC_TENDER.test(sourceText)) {
		if (/\b(darling|sweetheart|honey|my love|babe)\b/i.test(t.en)) return true
		if (/\bch[ée]rie?\b|mon amour|mon c(?:oe|œ)ur/i.test(t.fr)) return true
	}
	return /ស្រលាញ់|ស្រឡាញ់/.test(t.kh) && !SRC_LOVE.test(sourceText)
}

// Pronom de l'AUTRE dans une phrase qui ne parle que de soi (bug mesuré le 24/09/2026 : Lys écrit
// « J'ai fini le travail plus tôt », le khmer lui fait dire បង — piégé par le contexte, écrit par Chet).
// Ne juge qu'une source fr/en SANS 2e personne : dès qu'il y a « tu/toi/vous », les deux pronoms sont
// légitimes. Les regex écartent les faux amis : បង devant un pied de consonne (បង្ហាញ = montrer) ou
// dans បងប្អូន (frères et sœurs), et អូន précédé d'un pied (ប្អូន = cadet).
const SECOND_PERSON = /\b(tu|te|toi|ton|ta|tes|vous|votre|vos|you|your)\b|\bt['’]/i
const FIRST_PERSON = /\b(je|moi|me|mon|ma|mes|i|me|my)\b|\b[jm]['’]/i
const KH_BANG = /បង(?!\u17D2)(?!ប្អូន)/
const KH_OUN = /(?<!\u17D2)អូន/
export function pronounSwapped(sourceText: string, kh: string, isChet: boolean | null): boolean {
	if (isChet === null || /[ក-៿]/.test(sourceText)) return false
	// Un mot tendre (« ma chérie ») s'adresse à l'autre comme un « tu » : son pronom y est légitime.
	if (SECOND_PERSON.test(sourceText) || SRC_TENDER.test(sourceText) || !FIRST_PERSON.test(sourceText)) return false
	return isChet ? KH_OUN.test(kh) : KH_BANG.test(kh)
}

const ARABIC_TO_KHMER_DIGITS = '០១២៣៤៥៦៧៨៩'
function toKhmerDigits(n: number): string {
	return String(n).replace(/\d/g, d => ARABIC_TO_KHMER_DIGITS[Number(d)])
}

// Bug réel du 24/09/2026 : "vers 22h" rendu "8h" ou "11h" en khmer sur ~1/3 des essais (jamais en
// fr/en dans la même génération — dérive propre au khmer). Vérifie que chaque heure/montant/
// quantité de la source ressort dans le khmer, en chiffres (arabes ou khmers), équivalent 12h
// accepté pour une heure de 13 à 24 (ex "22h" → "១០" accepté en plus de "២២").
export function numbersPreserved(sourceText: string, kh: string): boolean {
	const matches = [...sourceText.matchAll(/(\d{1,2})\s?h(?:\d{2})?\b|(\d+(?:[.,]\d+)?)\s?(?:€|\$|%|km|kg)\b/gi)]
	return matches.every(m => {
		const n = Number(m[1] ?? m[2])
		if (!Number.isFinite(n)) return true
		const accepted = [String(n), toKhmerDigits(n)]
		if (m[1] && n >= 13 && n <= 24) accepted.push(String(n - 12), toKhmerDigits(n - 12))
		return accepted.some(v => kh.includes(v))
	})
}

/**
 * Directives d'adaptation GLM — dérivées de l'A/B réel GLM vs Gemini-3.6 (scripts/glm-prompt-v2.mjs,
 * messages réels du couple). Sans elles, GLM traduit trop littéralement et ajoute des mots
 * absents du source ("ឥឡូវនេះ", vocatif "អូន"...) ; avec elles il adopte le lexique khmer oral
 * naturel du couple (ហត់/ធូរ/តោះ/អរហ្នឹង) comme Gemini. C'est ce qui transformerait un modèle
 * "traducteur" en adaptateur. Lexque issu des sorties réelles de Gemini-3.6 (référence validée).
 *
 * Le lexique, l'anti-inversion de sens et l'anti-latin-collé vivent désormais UNIQUEMENT dans le
 * prompt partagé (buildTranslateSystem) — retirés d'ici le 22/09 pour ne plus les répéter deux fois avec des
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

// Prompts de traduction (system/user) — extraits de vertex.ts le 22/09/2026 en même temps que le
// reste des fonctions pures, pour la MÊME raison : plusieurs scripts d'éval ad-hoc
// (scripts/*.mjs) contenaient chacun une COPIE-COLLÉE de ces prompts à des dates différentes,
// silencieusement désynchronisées de la prod à chaque fix de traduction. En les import-ant
// directement d'ici, un script Node (via `node --experimental-strip-types`, aucune dépendance
// SvelteKit) teste TOUJOURS le prompt réel, jamais une copie qui a pu dater.
export function coupleContext(author?: string): string {
	const isChet = detectIsChet(author)
	const authorLine = isChet === true
		? `⚠️ AUTEUR DE CE MESSAGE = CHET (un HOMME). RÈGLE PRIORITAIRE SUR TOUT : quand il dit "je/moi/j'" → en khmer TOUJOURS "បង"(bang), JAMAIS "អូន"(oun) ; quand il dit "tu/toi" (il parle à Lys) → "អូន"(oun). Accord MASCULIN. Son « oui » = « បាទ » (le oui masculin). Ne te laisse JAMAIS influencer par le contenu du message (même s'il parle de beauté, de visage, de choses "féminines") ni par les messages précédents pour choisir le pronom de l'auteur : c'est CHET qui écrit, donc son "je" = "បង".`
		: isChet === false
			? `⚠️ AUTEUR DE CE MESSAGE = LYS (une FEMME). RÈGLE PRIORITAIRE SUR TOUT : quand elle dit "je/moi/j'" → en khmer TOUJOURS "អូន"(oun), JAMAIS "បង"(bang) ; quand elle dit "tu/toi" (elle parle à Chet) → "បង"(bang). Accord FÉMININ. Son « oui » = « ចា៎ស » (le oui féminin). Ne te laisse JAMAIS influencer par le contenu du message ni par les messages précédents pour choisir le pronom de l'auteur : c'est LYS qui écrit, donc son "je" = "អូន".`
			: ''
	return `CONTEXTE DU COUPLE (à respecter absolument) :
- Chet ("Chetana") = HOMME français. Lys ("Vornsok") = femme cambodgienne.
- En khmer ils s'appellent par des pronoms relationnels intimes : Chet se dit "បង"(bang) et appelle Lys "អូន"(oun) ; Lys se dit "អូន"(oun) et appelle Chet "បង"(bang).
${authorLine}

RENDU DES PRONOMS EN FRANÇAIS ET ANGLAIS (le point le plus important) :
- "អូន"(oun) et "បង"(bang) sont des PRONOMS relationnels, JAMAIS des noms propres. Ils ont DEUX usages, à distinguer par leur place dans la phrase :
  (a) SUJET ou OBJET d'un verbe (le mot est collé à un verbe qui agit dessus) → "je/moi" ou "tu/toi" (I/me ou you) selon qui parle.
      Ex : Lys écrit "អូននឹកបង" → "Tu me manques" / "I miss you". Chet écrit "បងស្រលាញ់អូន" → "Je t'aime" / "I love you".
  (b) INTERPELLATION (le mot est seul, en fin de phrase, en début de phrase suivi d'une pause, ou juste après un "oui/non" comme "ចា៎ស បង" / "បាទ អូន", sans verbe dont il serait le sujet ou l'objet) → c'est un petit mot tendre adressé à l'autre. Le rendre par "chéri" (quand Lys s'adresse à Chet) ou "chérie" (quand Chet s'adresse à Lys) en français, "darling" en anglais, à la MÊME place que dans l'original.
      Ex : Lys écrit "បងពូកែធ្វើណាស់ បង" → "Tu es très doué, chéri" / "You're so good at this, darling". Lys écrit "ចា៎ស បង" → "Oui, chéri" / "Yes, darling". Chet écrit "អូន, កុំភ្លេចញ៉ាំបាយ" → "Chérie, n'oublie pas de manger" / "Darling, don't forget to eat".
  Dans les deux cas le mot khmer disparaît de la phrase française/anglaise : il est remplacé par le pronom (a) ou par le mot tendre (b), jamais recopié en lettres latines.
- SENS INVERSE (message source en français/anglais) : un mot tendre adressé à l'autre ("ma chérie", "mon chéri", "mon amour", "darling", "my love") se traduit par le PRONOM relationnel lui-même, qui porte déjà la tendresse : Chet → "អូន" (ou "អូនសម្លាញ់"), Lys → "បង" (ou "បងសម្លាញ់"). Le mot tendre et le pronom FUSIONNENT en UN seul mot khmer, jamais un mot séparé inventé à côté.
      Ex : Chet écrit "Bonjour ma chérie, je suis dans le train" → "សួស្តីអូនសម្លាញ់ បងនៅក្នុងរថភ្លើង". Lys écrit "Bonne nuit mon chéri" → "រាត្រីសួស្តីបងសម្លាញ់".
- "គាត់" = 3ᵉ personne = une AUTRE personne (sa mère, un ami, quelqu'un dont on parle), jamais "tu/toi" ni "je". Utilise le CONTEXTE récent pour choisir "il" ou "elle" et savoir de qui il s'agit (ex : si Lys parle de sa mère → "elle").
- Garde TOUJOURS la même personne grammaticale que l'original : un "je" reste "je" (jamais "il/elle" ni un prénom), un "tu" reste "tu".

ÉCRITURE DU KHMER (RÈGLE ABSOLUE) :
- Le texte khmer ("kh") doit être écrit EXCLUSIVEMENT en écriture KHMÈRE (ភាសាខ្មែរ). Lys est CAMBODGIENNE, pas thaïlandaise ni indienne ni chinoise.
- INTERDIT ABSOLU : tout autre système d'écriture — pas un seul caractère thaï (ไทย), chinois/japonais (中文/日本語), coréen (한국어), indien/devanagari (हिन्दी), arabe (العربية) ni cyrillique. Uniquement du khmer.
- INTERDIT : toute romanisation / phonétique en lettres latines entre parenthèses dans le khmer. Écris "កែ", JAMAIS "កែ (kê)". Le khmer doit être pur, sans transcription latine.`.trim()
}

// Invariant (system) : contexte couple, règles, glossaire, schéma JSON — ne change que selon
// l'auteur (2 variantes), donc cacheable côté GLM. Le message lui-même vit dans buildTranslateUser.
export function buildTranslateSystem(author?: string): string {
	return `Tu es un assistant de traduction pour un couple : Chet (français) et Lys (cambodgienne).

${coupleContext(author)}

Rôle : détecter la langue du message, corriger discrètement les fautes, puis traduire dans les 2 autres langues.

Règles impératives :
- Privilégier l'intention et le registre sur la traduction mot-à-mot
- Registre : intime, oral, tendre — jamais formel ni littéraire
- "គាត់" = il/elle (3ème personne), JAMAIS "tu" — ne jamais confondre avec un interlocuteur direct
- Khmer oral et informel : ហ្នឹង (ça/ce/là), ម្កេះ (peu/seulement), ក្រ- (pénurie/difficulté ex: ក្រញ៉ាំ = manger peu), ម្ហី/ម្ហេ (comment) — privilégier le sens pragmatique, pas la forme écrite standard
- N'AJOUTE JAMAIS de sens absent du message source. En particulier, ne SPÉCIALISE jamais un terme vague/générique de la source (ex : "ce que tu as fait", "un truc") avec une interprétation plus précise que le contexte ne justifie pas clairement — et surtout jamais une interprétation physique/sexuelle non explicite dans le français. Reste au même niveau de généralité que l'original en cas de doute.
- Ne jamais inverser le sens du message : "cher"/"pas cher", "oui"/"non", "content"/"pas content" doivent rester dans le bon sens
- Pour un terme technique/emprunt sans mot khmer courant et absent du glossaire ci-dessous : translittération khmère usuelle en UN seul mot ; en cas de doute, garde le mot français isolé par des espaces plutôt que d'inventer un mot khmer
- Si le message est court ou ambigu, s'appuyer sur le message précédent pour identifier le sujet et l'intention (jamais pour ajouter un sens absent du message actuel)
- Anglais simple et naturel (Lys apprend — éviter les expressions idiomatiques complexes)
- Un vrai prénom collé à un titre (ex "បង Chet" = "Bang Chet") se garde tel quel ; mais "អូន"/"បង" SEULS sont des pronoms → "je/tu" (voir règle pronoms ci-dessus), jamais des noms
- Le champ de la langue d'origine = le message corrigé tel quel, MÊME personne et MÊME sens (ne le reformule pas, ne change jamais "je" en "il/elle" ni en prénom)
- Heures, montants, quantités : recopie le MÊME nombre en chiffres (arabes ou khmers), à la même place. Une heure du soir peut passer en notation 12h : "22h" → "ម៉ោង១០យប់" ou "ម៉ោង២២" ; "8h30" → "ម៉ោង៨:៣០ព្រឹក" ; "15€" → "១៥ អឺរ៉ូ"
- Mots tendres FIDÈLES à la source : un mot tendre (chéri, darling, mon amour, « je t'aime ») apparaît dans la traduction là où la source en a un, et une phrase neutre reste neutre. Ex : Chet écrit « oui c'était bon ce repas, je suis content » → « បាទ បាយហ្នឹងឆ្ងាញ់ បងសប្បាយចិត្ត » / « yes, that meal was good, I'm happy »
- Mot khmer COURANT et simple : si l'équivalent oral d'un mot ne te vient pas avec certitude, prends le mot khmer le plus courant qui dit la même chose (ex « s'ennuyer » → « ធុញទ្រាន់ ») plutôt que d'en composer un nouveau. Une tournure française figée se traduit par son équivalent khmer, pas mot à mot (ex « récupérer mon énergie » → « អោយមានកម្លាំងឡើងវិញ », « mais ça va » → « តែមិនអីទេ »)
- Un verbe français = un verbe khmer, même nombre d'actions : "je dois reprendre le sport" a UNE action (reprendre) → បងត្រូវតែចាប់ផ្ដើមកីឡាឡើងវិញ. Le "il faut que / je dois" se rend par ត្រូវ(តែ) collé directement au verbe de l'action

GLOSSAIRE (mot/notion → khmer à toujours utiliser) :
${GLOSSARY_LINES}

GLOSSAIRE KHMER → FRANÇAIS/ANGLAIS (rendu à toujours utiliser quand CE mot khmer apparaît dans le message source) :
${GLOSSARY_KH_LINES}

Réponds UNIQUEMENT avec un JSON valide (sans markdown), avec CES clés DANS CET ORDRE EXACT :
{"lang":"code_langue","terms":[{"src":"mot difficile du message","kh":"sa traduction khmère","fr":"sa traduction française (seulement si le mot difficile est en khmer)","en":"sa traduction anglaise (seulement si le mot difficile est en khmer)"}],"en":"text in English","kh":"អត្ថបទជាភាសាខ្មែរ","fr":"texte en français"}
- "lang" : décide-le en PREMIER — "fr", "en" ou "kh"
- "terms" : les mots/expressions difficiles de CE message (médical, couleur inhabituelle, montant, HEURE, MOT TENDRE ou SALUTATION adressée à l'autre, emprunt, ou mot du glossaire khmer ci-dessus) — engage-toi sur leur traduction AVANT de rédiger les phrases ; tableau vide [] si rien de difficile. Si le mot difficile est en khmer, renseigne aussi "fr" et "en" du terme
- "en" AVANT "kh" : traduis d'abord en anglais (pivot), puis le khmer à partir du sens anglais déjà posé
- "fr" en dernier : le message corrigé tel quel (même personne, même sens)`.trim()
}

export function buildTranslateUser(text: string, previousMessage?: string): string {
	const ctxLine = previousMessage
		? `CONVERSATION RÉCENTE (contexte pour lever les ambiguïtés de sujet, de genre et d'intention — chaque ligne = "auteur: message") :\n${previousMessage}\n\n`
		: ''
	return `${ctxLine}Message : "${text}"`
}
