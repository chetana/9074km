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

// Prompts de traduction (system/user) — extraits de vertex.ts le 22/09/2026 en même temps que le
// reste des fonctions pures, pour la MÊME raison : plusieurs scripts d'éval ad-hoc
// (scripts/*.mjs) contenaient chacun une COPIE-COLLÉE de ces prompts à des dates différentes,
// silencieusement désynchronisées de la prod à chaque fix de traduction. En les import-ant
// directement d'ici, un script Node (via `node --experimental-strip-types`, aucune dépendance
// SvelteKit) teste TOUJOURS le prompt réel, jamais une copie qui a pu dater.
export function coupleContext(author?: string): string {
	const isChet = detectIsChet(author)
	const authorLine = isChet === true
		? `⚠️ AUTEUR DE CE MESSAGE = CHET (un HOMME). RÈGLE PRIORITAIRE SUR TOUT : quand il dit "je/moi/j'" → en khmer TOUJOURS "បង"(bang), JAMAIS "អូន"(oun) ; quand il dit "tu/toi" (il parle à Lys) → "អូន"(oun). Accord MASCULIN. Ne te laisse JAMAIS influencer par le contenu du message (même s'il parle de beauté, de visage, de choses "féminines") ni par les messages précédents pour choisir le pronom de l'auteur : c'est CHET qui écrit, donc son "je" = "បង".`
		: isChet === false
			? `⚠️ AUTEUR DE CE MESSAGE = LYS (une FEMME). RÈGLE PRIORITAIRE SUR TOUT : quand elle dit "je/moi/j'" → en khmer TOUJOURS "អូន"(oun), JAMAIS "បង"(bang) ; quand elle dit "tu/toi" (elle parle à Chet) → "បង"(bang). Accord FÉMININ. Ne te laisse JAMAIS influencer par le contenu du message ni par les messages précédents pour choisir le pronom de l'auteur : c'est LYS qui écrit, donc son "je" = "អូន".`
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

GLOSSAIRE (mot/notion → khmer à toujours utiliser) :
${GLOSSARY_LINES}

Réponds UNIQUEMENT avec un JSON valide (sans markdown), avec CES clés DANS CET ORDRE EXACT :
{"lang":"code_langue","terms":[{"src":"mot difficile du message","kh":"sa traduction khmère"}],"en":"text in English","kh":"អត្ថបទជាភាសាខ្មែរ","fr":"texte en français"}
- "lang" : décide-le en PREMIER — "fr", "en" ou "kh"
- "terms" : les mots difficiles de CE message (médical, couleur inhabituelle, montant, emprunt) — engage-toi sur leur traduction AVANT de rédiger les phrases ; tableau vide [] si rien de difficile
- "en" AVANT "kh" : traduis d'abord en anglais (pivot), puis le khmer à partir du sens anglais déjà posé
- "fr" en dernier : le message corrigé tel quel (même personne, même sens)`.trim()
}

export function buildTranslateUser(text: string, previousMessage?: string): string {
	const ctxLine = previousMessage
		? `CONVERSATION RÉCENTE (contexte pour lever les ambiguïtés de sujet, de genre et d'intention — chaque ligne = "auteur: message") :\n${previousMessage}\n\n`
		: ''
	return `${ctxLine}Message : "${text}"`
}
