import { createSign } from 'crypto'
import { env } from '$env/dynamic/private'
import { glmEnabled, chatGo, GLM_ADAPT } from './glm'
import { logTranslationIssue } from './translation-issues'

function parseServiceAccountJson(raw: string): Record<string, string> {
  // gcloud --env-vars-file YAML uses single-quoted strings where \n is literal backslash+n.
  // Strip \n sequences outside of JSON string values (structural whitespace from pretty-printing).
  let fixed = '', inString = false, i = 0
  while (i < raw.length) {
    if (inString && raw[i] === '\\') { fixed += raw[i++]; if (i < raw.length) fixed += raw[i++]; continue }
    if (raw[i] === '"') inString = !inString
    if (!inString && raw[i] === '\\' && raw[i + 1] === 'n') { i += 2; continue }
    fixed += raw[i++]
  }
  const creds = JSON.parse(fixed)
  creds.private_key = (creds.private_key as string).replace(/\\n/g, '\n').trim() + '\n'
  creds.client_email = (creds.client_email as string).trim()
  return creds
}

export async function getAccessToken(): Promise<string> {
  const raw = env.GCS_SERVICE_ACCOUNT_JSON!.trim()
  const creds = parseServiceAccountJson(raw)

  const now = Math.floor(Date.now() / 1000)
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({
    iss: creds.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })).toString('base64url')

  const unsigned = `${header}.${payload}`
  const signature = createSign('RSA-SHA256').update(unsigned).sign(creds.private_key, 'base64url')
  const jwt = `${unsigned}.${signature}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  })
  const data = await res.json() as { access_token: string }
  return data.access_token
}

// gemini-2.5-flash-lite : pas cher ($0.10/$0.40) ET fiable sur le khmer (pronoms bang/oun testés 20/20
// avec contexte biaisant). gemini-3.5-flash-lite, lui, ratait les pronoms et glissait vers le thaï → écarté.
const GEMINI_MODELS = ['gemini-2.5-flash-lite', 'gemini-2.5-flash'] as const

function geminiEndpoint(project: string, model: string, location: string): string {
  if (model.startsWith('gemini-3')) {
    return `https://aiplatform.googleapis.com/v1/projects/${project}/locations/global/publishers/google/models/${model}:generateContent`
  }
  return `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:generateContent`
}

const MAX_OUTPUT_CEILING = 8192

async function geminiRequest(systemInstruction: string, parts: object[], maxTokens = 300, models: readonly string[] = GEMINI_MODELS): Promise<string> {
  const token = await getAccessToken()
  const project = env.VERTEX_PROJECT_ID ?? 'cykt-399216'
  const location = env.VERTEX_LOCATION ?? 'us-central1'

  let lastError: Error | null = null
  for (const model of models) {
    let budget = Math.min(MAX_OUTPUT_CEILING, maxTokens)
    // Relance le même modèle avec un budget élargi si la sortie est coupée (MAX_TOKENS).
    while (true) {
      const res = await fetch(geminiEndpoint(project, model, location), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(systemInstruction ? { systemInstruction: { parts: [{ text: systemInstruction }] } } : {}),
          contents: [{ role: 'user', parts }],
          generationConfig: { temperature: 0.2, maxOutputTokens: budget, thinkingConfig: { thinkingBudget: 0 } },
        }),
      })
      const data = await res.json() as any
      if (!res.ok) {
        console.warn(`[vertex] ${model} failed (${res.status}): ${data?.error?.message ?? 'unknown'}`)
        lastError = new Error(`Gemini ${res.status}: ${data?.error?.message ?? 'unknown'}`)
        break // modèle suivant
      }
      const cand = data?.candidates?.[0]
      if (cand?.finishReason === 'MAX_TOKENS' && budget < MAX_OUTPUT_CEILING) {
        const bumped = Math.min(MAX_OUTPUT_CEILING, Math.max(budget * 2, 2048))
        console.warn(`[vertex] ${model} sortie tronquée (budget ${budget}) → relance à ${bumped}`)
        budget = bumped
        continue
      }
      const raw: string = cand?.content?.parts?.[0]?.text ?? '{}'
      return raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    }
  }
  throw lastError ?? new Error('All Gemini models failed')
}

// Budget de sortie proportionnel à l'entrée : une traduction en 3 langues (dont le khmer,
// gourmand en tokens) fait ~1 token de sortie par caractère d'entrée ; on prend large.
function translateBudget(text: string, factor = 4): number {
  return Math.min(MAX_OUTPUT_CEILING, Math.max(1024, Math.ceil(text.length * factor)))
}

// Découpe un texte long aux frontières de phrase (fr/en/kh), morceaux <= maxLen.
function splitIntoChunks(text: string, maxLen: number): string[] {
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

async function callGemini(prompt: string, maxTokens = 300, models: readonly string[] = GEMINI_MODELS): Promise<string> {
	// Moteur principal : GLM-5.3-flash via OpenCode Go (même qualité de khmer, ~1/10 du prix).
	// filet de sécurité : tout échec GLM (quota Go saturé, indispo…) retombe sur Gemini sans
	// aucun impact utilisateur — d'où le try/catch ignoré ici.
	// Utilisé par les leçons/grading (prompt unique, pas de split system/user — voir
	// callGeminiSystem ci-dessous pour la traduction, qui en a besoin).
	if (glmEnabled()) {
		try {
			return await chatGo(`Tu réponds UNIQUEMENT avec un JSON valide (sans markdown).${GLM_ADAPT}`, prompt, maxTokens)
		} catch (e) {
			console.warn(`[engine] GLM KO → bascule Gemini (${(e as Error).message})`)
		}
	}
	return geminiRequest('', [{ text: prompt }], maxTokens, models)
}

/**
 * Variante system/user de callGemini, pour la traduction (voir buildTranslateSystem) :
 * l'invariant (contexte couple, règles, glossaire, schéma JSON) vit dans `system`, ce qui le
 * rend cacheable côté GLM (x-opencode-session) et évite de le reformuler différemment à chaque
 * appel. Retourne aussi le moteur réellement utilisé (pour journaliser les incidents sans deviner).
 */
async function callGeminiSystem(
	system: string, user: string, maxTokens = 300, models: readonly string[] = GEMINI_MODELS
): Promise<{ text: string; engine: 'glm' | 'gemini' }> {
	if (glmEnabled()) {
		try {
			return { text: await chatGo(`${system}\n\n${GLM_ADAPT}`, user, maxTokens), engine: 'glm' }
		} catch (e) {
			console.warn(`[engine] GLM KO → bascule Gemini (${(e as Error).message})`)
		}
	}
	return { text: await geminiRequest(system, [{ text: user }], maxTokens, models), engine: 'gemini' }
}


// Modèles plus fiables sur le khmer (utilisés en secours si le lite contamine la sortie).
const STRONG_MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'] as const

// Traductions DU COUPLE (chat/suggest/transcribe) : gemini-3.6-flash (le plus récent, khmer le
// plus naturel + registre intime bang/oun constant), fallback 2.5-flash. ~€5/mois au volume réel.
// Les leçons/grading restent sur GEMINI_MODELS (lite, pas cher, non sensible au registre intime).
const COUPLE_MODELS = ['gemini-3.6-flash', 'gemini-2.5-flash'] as const

// Le khmer et le thaï se ressemblent : les petits modèles glissent parfois vers le thaï.
// Scripts qui n'ont RIEN à faire dans un texte khmer et déclenchent un re-roll sur le modèle fort.
// Couvre : thaï, indien (devanagari/bengali/tamoul), chinois+japonais (CJK+kana), coréen (hangul),
// arabe, cyrillique, hébreu. Le khmer (U+1780–17FF), le latin, les chiffres, la ponctuation et les
// emoji restent autorisés. Remplace l'ancien contrôle « thaï seulement » (Lys voyait passer du
// chinois/indien que le filet ne rattrapait pas).
const FOREIGN_SCRIPT =
  /[฀-๿ऀ-ॿঀ-৿஀-௿一-鿿㐀-䶿぀-ヿ가-힯ᄀ-ᇿ؀-ۿЀ-ӿ֐-׿]/
function containsForeignScript(s?: string): boolean {
  return FOREIGN_SCRIPT.test(s ?? '')
}

// Corruption détectée le 22/09/2026 sur "boutons" → "បុortonexus" : du latin collé
// SANS espace à du khmer (signature d'un mot halluciné/tronqué en cours de génération).
// Un vrai nom propre latin dans une phrase khmère est toujours séparé par une espace
// ("iPhone", "WhatsApp") — cette adjacence directe khmer↔latin n'arrive jamais en usage normal.
const GLUED_LATIN = /[ក-៿][A-Za-z]{2,}|[A-Za-z]{2,}[ក-៿]/
function containsGluedLatin(s?: string): boolean {
  return GLUED_LATIN.test(s ?? '')
}

// Retire les gloses de romanisation latine insérées à tort dans le khmer (ex "កែ (kê)" → "កែ").
// Ne matche que des parenthèses ne contenant QUE du latin/ponctuation (jamais du khmer).
function cleanKhmer(kh?: string): string {
  return (kh ?? '')
    .replace(/\s*[（(][A-Za-zÀ-ÿ0-9'’ .,:;\/-]+[)）]/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

function coupleContext(author?: string): string {
  const normalized = author?.normalize('NFD').replace(/[\u0300-\u036f]/g, '') ?? ''
  const isChet = author ? /^(chet|chetana)$/i.test(normalized) : null
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
- "អូន"(oun) et "បង"(bang) sont des PRONOMS relationnels, JAMAIS des noms propres. En français/anglais, les rendre par "je/moi" ou "tu/toi" (I/me ou you) selon qui parle — NE JAMAIS écrire "Oun", "Bang" ni "Bong" comme un nom dans le français ou l'anglais.
  Ex : Lys écrit "អូននឹកបង" → "Tu me manques" (PAS "Oun me manque, Bang"). Chet écrit "បងស្រលាញ់អូន" → "Je t'aime" (PAS "Bang aime Oun").
- "គាត់" = 3ᵉ personne = une AUTRE personne (sa mère, un ami, quelqu'un dont on parle), jamais "tu/toi" ni "je". Utilise le CONTEXTE récent pour choisir "il" ou "elle" et savoir de qui il s'agit (ex : si Lys parle de sa mère → "elle").
- Garde TOUJOURS la même personne grammaticale que l'original : un "je" reste "je" (jamais "il/elle" ni un prénom), un "tu" reste "tu".

ÉCRITURE DU KHMER (RÈGLE ABSOLUE) :
- Le texte khmer ("kh") doit être écrit EXCLUSIVEMENT en écriture KHMÈRE (ភាសាខ្មែរ). Lys est CAMBODGIENNE, pas thaïlandaise ni indienne ni chinoise.
- INTERDIT ABSOLU : tout autre système d'écriture — pas un seul caractère thaï (ไทย), chinois/japonais (中文/日本語), coréen (한국어), indien/devanagari (हिन्दी), arabe (العربية) ni cyrillique. Uniquement du khmer.
- INTERDIT : toute romanisation / phonétique en lettres latines entre parenthèses dans le khmer. Écris "កែ", JAMAIS "កែ (kê)". Le khmer doit être pur, sans transcription latine.`.trim()
}

export interface Translations { fr: string; en: string; kh: string; lang?: string }
interface TranslateTerm { src: string; kh: string }

// Glossaire cible UNIQUEMENT (jamais les formes fautives) : un petit modèle a du mal à pondérer
// une négation ("jamais X") — une chaîne présente dans le prompt devient plus probable en sortie,
// pas moins. La détection des formes fautives est le rôle du code (containsForeignScript,
// containsGluedLatin, termsEchoed), pas du prompt. Revu le 22/09 suite à une revue de prompt.
const GLOSSARY_LINES = `- allergie/allergique → អាលែកហ្ស៊ី
- sésame → ល្ង
- acidulé/aigre (goût) → ជូរ
- bleu (couleur) → ខៀវ`

// Invariant (system) : contexte couple, règles, glossaire, schéma JSON — ne change que selon
// l'auteur (2 variantes), donc cacheable côté GLM. Le message lui-même vit dans buildTranslateUser.
function buildTranslateSystem(author?: string): string {
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

function buildTranslateUser(text: string, previousMessage?: string): string {
  const ctxLine = previousMessage
    ? `CONVERSATION RÉCENTE (contexte pour lever les ambiguïtés de sujet, de genre et d'intention — chaque ligne = "auteur: message") :\n${previousMessage}\n\n`
    : ''
  return `${ctxLine}Message : "${text}"`
}

// Validation de forme (D) : rejette un JSON qui a l'air valide mais qui ne l'est pas — champ
// manquant/vide, placeholder du schéma recopié tel quel, ou kh identique à fr/en (non-traduction).
// Pick explicite des clés : n'importe quelle clé en plus renvoyée par le modèle est ignorée.
function pickTranslation(raw: string): Translations & { terms: TranslateTerm[] } {
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

// Si le modèle s'est engagé sur un terme difficile (glossaire), sa traduction annoncée doit
// réapparaître dans le khmer final — sinon c'est le signe d'une génération qui a divergé en route.
function termsEchoed(t: { kh: string; terms: TranslateTerm[] }): boolean {
  return t.terms.every(term => term.kh && t.kh.includes(term.kh))
}

async function attemptTranslate(
  system: string, user: string, budget: number, models: readonly string[], forceGemini: boolean
): Promise<{ t: Translations & { terms: TranslateTerm[] }; engine: 'glm' | 'gemini' }> {
  const { text: raw, engine } = forceGemini
    ? { text: await geminiRequest(system, [{ text: user }], budget, models), engine: 'gemini' as const }
    : await callGeminiSystem(system, user, budget, models)
  const t = pickTranslation(raw)
  if (!termsEchoed(t)) throw new Error('terme du glossaire annoncé mais absent du khmer final')
  return { t, engine }
}

// Chemin unique de traduction avec escalade : tentative légère (GLM/2.5-flash-lite) → si
// corruption détectée (script étranger/latin collé) OU échec technique/de forme, escalade DIRECTE
// vers Gemini fort EN BYPASSANT GLM (jamais un simple retry du même moteur, qui reproduirait la
// même erreur — bug découvert le 22/09 sur "boutons"→latin collé). Si l'escalade échoue aussi,
// l'appelant (geminiTranslateAll / translateInChunks) décide de la suite plutôt que de renvoyer
// silencieusement le texte source comme si c'était du khmer (ancien bug : aucune trace en cas
// d'échec total, l'utilisatrice recevait du français affiché comme "khmer").
async function translateWithEscalation(
  text: string, author: string | undefined, previousMessage: string | undefined, budgetFactor = 4
): Promise<Translations> {
  const system = buildTranslateSystem(author)
  const user = buildTranslateUser(text, previousMessage)
  const budget = translateBudget(text, budgetFactor)

  let light: { t: Translations & { terms: TranslateTerm[] }; engine: 'glm' | 'gemini' } | null = null
  try {
    light = await attemptTranslate(system, user, budget, COUPLE_MODELS, false)
  } catch (e) {
    console.warn(`[translate] moteur léger échoué (${(e as Error).message}) → escalade Gemini fort`)
  }

  let badKh = ''
  let reason: 'foreign_script' | 'glued_latin' | null = null
  if (light) {
    reason = containsForeignScript(light.t.kh) ? 'foreign_script' : containsGluedLatin(light.t.kh) ? 'glued_latin' : null
    if (reason) { badKh = light.t.kh; light = null }
  }
  if (light) return { fr: light.t.fr, en: light.t.en, kh: cleanKhmer(light.t.kh), lang: light.t.lang }

  const strong = await attemptTranslate(system, user, budget, STRONG_MODELS, true) // throw si échec total → géré par l'appelant
  if (reason) void logTranslationIssue({ reason, sourceText: text, author, badKh, fixedKh: strong.t.kh, engine: 'glm' })
  return { fr: strong.t.fr, en: strong.t.en, kh: cleanKhmer(strong.t.kh), lang: strong.t.lang }
}

export async function geminiTranslateAll(text: string, author?: string, previousMessage?: string): Promise<Translations> {
  try {
    return await translateWithEscalation(text, author, previousMessage)
  } catch (e) {
    // Échec même après escalade Gemini fort (le plus souvent : message très long → JSON tronqué
    // des deux côtés). On découpe en phrases, on traduit chaque morceau, et on recolle.
    console.warn(`[translate] échec même après escalade Gemini fort (${(e as Error).message}) — découpage en morceaux`)
    return translateInChunks(text, author, previousMessage)
  }
}

async function translateInChunks(text: string, author?: string, previousMessage?: string): Promise<Translations> {
  const chunks = splitIntoChunks(text, 700)
  const parts: Translations[] = []
  let ctx = previousMessage
  for (const chunk of chunks) {
    try {
      const t = await translateWithEscalation(chunk, author, ctx, 4)
      parts.push(t)
      ctx = `${ctx ? ctx + '\n' : ''}${author ?? '?'}: ${chunk}` // enchaîne le contexte pour la cohérence
    } catch (e) {
      // Dernier recours réel (message très long ET escalade Gemini fort a échoué sur ce
      // morceau) : on garde le texte source plutôt que de perdre le message, mais on le
      // journalise désormais — avant, ce cas ne laissait AUCUNE trace (bug du 22/09).
      console.warn(`[translate] morceau échoué même après escalade (${(e as Error).message}) — texte source conservé pour ce bout`)
      void logTranslationIssue({ reason: 'parse_failure', sourceText: chunk, author, badKh: '(aucune sortie exploitable)', fixedKh: chunk, engine: 'gemini' })
      parts.push({ fr: chunk, en: chunk, kh: chunk, lang: '' })
    }
  }
  return {
    fr: parts.map(p => p.fr).filter(Boolean).join(' '),
    en: parts.map(p => p.en).filter(Boolean).join(' '),
    kh: parts.map(p => p.kh).filter(Boolean).join(' '),
    lang: parts.find(p => p.lang)?.lang ?? '',
  }
}

export interface LessonItem { original: string; corrected: string; explanation: string }

export interface GeminiSuggestion {
  corrected: string; fr: string; en: string; kh: string; lang: string; question: string; lessons?: LessonItem[]
}

function buildSuggestSystem(authorLang: 'fr' | 'kh'): string {
  const author = authorLang === 'fr' ? 'Chet' : 'Lys'
  const context = authorLang === 'kh'
    ? `Lys (femme cambodgienne) écrit à Chet (français). Elle écrit probablement en khmer, parfois en français ou anglais appris.`
    : `Chet (homme français) écrit à Lys (cambodgienne). Il écrit probablement en français, parfois en anglais ou khmer appris.`
  const questionHint = authorLang === 'kh'
    ? `question courte en khmer, commençant par "តើអ្នកចង់និយាយថា"`
    : `question courte en français, commençant par "Tu voulais dire"`
  const lessonsHint = authorLang === 'kh'
    ? `,"lessons":[{"original":"ពាក្យដើម","corrected":"ពាក្យដែលបានកែ","explanation":"ការពន្យល់ខ្លីជាភាសាខ្មែរ"}]`
    : `,"lessons":[{"original":"mot original","corrected":"mot corrigé","explanation":"explication courte en français"}]`
  const lessonsRule = authorLang === 'kh'
    ? '- lessons : tableau avec une entrée par faute (explanation en khmer simple) — omis si aucune faute'
    : '- lessons : tableau avec une entrée par faute (explanation en français simple) — omis si aucune faute'

  return `Tu es un assistant de traduction pour un couple : Chet (français) et Lys (cambodgienne).
${context}

${coupleContext(author)}

Rôle : détecter la langue réelle du message, corriger discrètement les fautes, puis traduire dans les 2 autres langues.
Règles :
- Corriger sans dénaturer le sens ni le ton
- Signaler la correction avec une question naturelle dans la langue de l'auteur
- Registre intime, oral et tendre — jamais formel
- "គាត់" = il/elle (3ème personne), JAMAIS "tu" — ne jamais confondre avec un interlocuteur direct
- Khmer oral et informel : ហ្នឹង (ça/là), ម្កេះ (peu/seulement), ក្រ- (pénurie ex: ក្រញ៉ាំ = manger peu), ម្ហី (comment) — sens pragmatique avant forme écrite
- N'AJOUTE JAMAIS de sens absent du message source, et ne SPÉCIALISE jamais un terme vague/générique avec une interprétation plus précise (surtout physique/sexuelle) que le contexte ne justifie pas
- Ne jamais inverser le sens du message : "cher"/"pas cher", "oui"/"non", "content"/"pas content" doivent rester dans le bon sens
- Pour un terme technique/emprunt sans mot khmer courant et absent du glossaire ci-dessous : translittération khmère usuelle en UN seul mot ; en cas de doute, garde le mot français isolé par des espaces plutôt que d'inventer un mot khmer
- Si le message est court ou ambigu, s'appuyer sur le message précédent pour identifier l'intention
- Si aucune faute, ne mets pas de champ "lessons"
${lessonsRule}

GLOSSAIRE (mot/notion → khmer à toujours utiliser) :
${GLOSSARY_LINES}

Réponds UNIQUEMENT avec un JSON valide (sans markdown), avec CES clés DANS CET ORDRE EXACT :
{"lang":"code_langue","terms":[{"src":"mot difficile du message","kh":"sa traduction khmère"}],"en":"text in English","kh":"អត្ថបទជាភាសាខ្មែរ","fr":"texte en français","corrected":"message corrigé","question":"${questionHint}"${lessonsHint}}
- "lang" et "terms" d'abord (voir règle ci-dessus), "en" AVANT "kh"
- "corrected" : le message corrigé tel quel, dans SA langue d'origine`.trim()
}

function buildSuggestUser(text: string, previousMessage?: string): string {
  const ctxLine = previousMessage ? `MESSAGE PRÉCÉDENT (contexte) : "${previousMessage}"\n\n` : ''
  return `${ctxLine}Message : "${text}"`
}

function pickSuggestion(raw: string): GeminiSuggestion & { terms: TranslateTerm[] } {
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

export async function geminiSuggest(text: string, authorLang: 'fr' | 'kh', previousMessage?: string): Promise<GeminiSuggestion> {
  const author = authorLang === 'fr' ? 'Chet' : 'Lys'
  const system = buildSuggestSystem(authorLang)
  const user = buildSuggestUser(text, previousMessage)
  const budget = translateBudget(text, 6)

  async function attempt(models: readonly string[], forceGemini: boolean): Promise<GeminiSuggestion & { terms: TranslateTerm[] }> {
    const raw = forceGemini
      ? await geminiRequest(system, [{ text: user }], budget, models)
      : (await callGeminiSystem(system, user, budget, models)).text
    const s = pickSuggestion(raw)
    if (!termsEchoed(s)) throw new Error('terme du glossaire annoncé mais absent du khmer final')
    return s
  }

  let s: GeminiSuggestion & { terms: TranslateTerm[] }
  let badKh = ''
  let reason: 'foreign_script' | 'glued_latin' | null = null
  try {
    s = await attempt(COUPLE_MODELS, false)
    reason = containsForeignScript(s.kh) ? 'foreign_script' : containsGluedLatin(s.kh) ? 'glued_latin' : null
    if (reason) { badKh = s.kh; throw new Error('khmer suspect (script étranger ou latin collé)') }
  } catch (e) {
    console.warn(`[suggest] moteur léger échoué ou suspect (${(e as Error).message}) → escalade Gemini fort (bypass GLM)`)
    s = await attempt(STRONG_MODELS, true)
    if (reason) void logTranslationIssue({ reason, sourceText: text, author, badKh, fixedKh: s.kh, engine: 'glm' })
  }
  s.kh = cleanKhmer(s.kh)
  return { corrected: s.corrected, fr: s.fr, en: s.en, kh: s.kh, lang: s.lang, question: s.question, lessons: s.lessons }
}

export async function geminiTts(text: string, lang: 'fr' | 'kh'): Promise<string> {
  const token = await getAccessToken()
  const project = env.VERTEX_PROJECT_ID ?? 'cykt-399216'
  const location = env.VERTEX_LOCATION ?? 'us-central1'
  const model = 'gemini-2.5-flash-preview-tts'
  const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:generateContent`

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: `Say this in ${lang === 'kh' ? 'Khmer' : 'French'}: ${text}` }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: lang === 'kh' ? 'Kore' : 'Zephyr' } } },
      },
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as any
    throw new Error(`TTS ${res.status}: ${err?.error?.message ?? 'unknown'}`)
  }
  const data = await res.json() as any
  const base64 = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data
  if (!base64) throw new Error('No audio data returned')
  return base64 as string
}

export interface TranscriptionResult { text: string; fr: string; en: string; kh: string }

export async function geminiTranscribeAndTranslate(audioBase64: string, mimeType: string, author?: string, previousMessage?: string): Promise<TranscriptionResult> {
  const ctxLine = previousMessage ? `\nMESSAGE PRÉCÉDENT (contexte) : "${previousMessage}"` : ''
  const prompt = `Transcris EXACTEMENT ce qui est dit dans ce message vocal, mot pour mot, sans rien ajouter ni inventer.
Détecte la langue (français, anglais ou khmer).
Traduis ensuite dans les 2 autres langues (traduction courte et fidèle au message d'origine).

${coupleContext(author)}${ctxLine}

Règles de traduction :
- "គាត់" = il/elle (3ème personne), JAMAIS "tu"
- Khmer oral/informel : ហ្នឹង (ça/là), ម្កេះ (peu/seulement), ក្រ- (pénurie) — sens pragmatique avant forme écrite
- N'ajoute jamais de sens absent de l'audio, et ne spécialise jamais un terme vague avec une interprétation plus précise (surtout physique/sexuelle) non justifiée
- Glossaire : ${GLOSSARY_LINES.replace(/\n/g, ' ; ').replace(/- /g, '')}
- Si le message est court ou ambigu, s'appuyer sur le message précédent pour identifier le sujet
- Anglais simple (Lys apprend — éviter les expressions idiomatiques)

Réponds UNIQUEMENT avec un JSON valide (sans markdown) :
{"text":"transcription exacte","fr":"texte en français","en":"text in English","kh":"អត្ថបទជាភាសាខ្មែរ"}`

  // Longueur du vocal inconnue à l'avance → budget large ; l'auto-retry MAX_TOKENS couvre les longs
  const parts = [{ inlineData: { mimeType, data: audioBase64 } }, { text: prompt }]
  let r = JSON.parse(await geminiRequest('', parts, 2048, COUPLE_MODELS)) as TranscriptionResult // 3.6-flash (khmer le plus naturel)
  if (containsForeignScript(r.kh) || containsForeignScript(r.text) || containsGluedLatin(r.kh)) r = JSON.parse(await geminiRequest('', parts, 2048, STRONG_MODELS)) as TranscriptionResult
  r.kh = cleanKhmer(r.kh)
  if (/[ក-៿]/.test(r.text)) r.text = cleanKhmer(r.text) // nettoie seulement si le texte transcrit est khmer
  return r
}

// ─────────────────────────── Moteur d'apprentissage ───────────────────────────

export interface LessonGenInput {
  level: string          // 'A1' | 'A2' | 'B1'
  title: string          // titre FR de l'unité
  grammar: string        // focus grammatical
  theme: string          // champ lexical
  canDo: string          // objectif can-do FR
  seedVocab: string[]    // mots-graines FR
  l1: 'fr' | 'kh'        // langue maternelle de l'apprenant (consignes/explications dans cette langue)
}

/**
 * Génère une leçon structurée (intro + 6 exercices variés) pour une unité du curriculum.
 * Cible = français. Consignes et explications dans la L1 de l'apprenant.
 */
export async function geminiGenerateLesson(input: LessonGenInput): Promise<unknown> {
  const l1Name = input.l1 === 'kh' ? 'khmer (ភាសាខ្មែរ)' : 'français'
  const introExample = input.l1 === 'kh'
    ? 'ការពន្យល់ខ្លីជាភាសាខ្មែរ ជាមួយឧទាហរណ៍បារាំង'
    : 'explication courte en français avec exemples'

  const prompt = `Tu es un professeur de Français Langue Étrangère (FLE) expert, bienveillant et précis.
Tu crées une leçon pour une apprenante dont la langue maternelle est le ${l1Name}, qui apprend le FRANÇAIS.

NIVEAU CECRL : ${input.level}
UNITÉ : "${input.title}"
OBJECTIF (can-do) : ${input.canDo}
POINT DE GRAMMAIRE : ${input.grammar}
THÈME LEXICAL : ${input.theme}
VOCABULAIRE DE DÉPART : ${input.seedVocab.join(', ')}

RÈGLES IMPÉRATIVES :
- Adapte STRICTEMENT la difficulté au niveau ${input.level}. En A1, phrases très courtes et fréquentes.
- Toutes les CONSIGNES, QUESTIONS et EXPLICATIONS sont en ${l1Name}. Le CONTENU à apprendre est en français correct.
- Le français doit être impeccable (orthographe, accords, accents).
- Crée EXACTEMENT 6 exercices, dans cet ordre et de ces types : "mcq", "listen", "fill", "order", "mcq", "translate".
- Varie le vocabulaire autour du thème, reste utile pour la vie quotidienne d'un couple à distance.
- Pour "mcq" : question en ${l1Name}, 3 options, une seule correcte (champ answer = index 0-2), explain en ${l1Name}.
- Pour "listen" : audio = UNE phrase française simple ; options = 3 sens proposés en ${l1Name} ; answer = index correct ; explain en ${l1Name}.
- Pour "fill" : phrase française coupée en "before" + trou + "after" ; 3 options françaises ; answer = index correct ; explain en ${l1Name} (pourquoi cette forme).
- Pour "order" : tokens = les mots d'UNE phrase française correcte, dans le DÉSORDRE ; answer = la phrase correcte ; hint = son sens en ${l1Name}. 4 à 7 mots maximum.
- Pour "translate" : prompt = une phrase en ${l1Name} à traduire ; expected = la traduction française modèle ; explain = point clé en ${l1Name}.
- "intro" : ${introExample} (2-3 phrases max).

Réponds UNIQUEMENT avec un JSON valide (sans markdown), structure EXACTE :
{
 "intro": "...",
 "exercises": [
  {"type":"mcq","q":"...","options":["...","...","..."],"answer":0,"explain":"..."},
  {"type":"listen","audio":"phrase française","options":["...","...","..."],"answer":0,"explain":"..."},
  {"type":"fill","before":"début ","after":" fin","options":["...","...","..."],"answer":0,"explain":"..."},
  {"type":"order","tokens":["mot","mot","mot"],"answer":"phrase correcte","hint":"..."},
  {"type":"mcq","q":"...","options":["...","...","..."],"answer":0,"explain":"..."},
  {"type":"translate","prompt":"phrase en ${l1Name}","expected":"traduction française","explain":"..."}
 ]
}`

  const raw = await callGemini(prompt, 3000)
  return JSON.parse(raw)
}

export interface GradeResult { correct: boolean; score: number; feedback: string; corrected: string }

/**
 * Corrige une traduction libre (production écrite) : compare la réponse de l'apprenant
 * à la traduction modèle, avec tolérance sur les variantes correctes. Feedback en L1.
 */
export async function geminiGradeTranslation(
  l1Prompt: string, expected: string, learnerAnswer: string, l1: 'fr' | 'kh'
): Promise<GradeResult> {
  const l1Name = l1 === 'kh' ? 'khmer' : 'français'
  const prompt = `Tu es un correcteur de FLE bienveillant. Une apprenante (langue maternelle : ${l1Name}) devait traduire en français.

PHRASE À TRADUIRE (${l1Name}) : "${l1Prompt}"
TRADUCTION MODÈLE (référence) : "${expected}"
RÉPONSE DE L'APPRENANTE : "${learnerAnswer}"

Évalue avec BIENVEILLANCE et tolérance :
- Accepte toute traduction française correcte et naturelle, même différente du modèle.
- score : 2 = parfait/excellent, 1 = compréhensible avec petites fautes, 0 = incorrect ou hors-sujet.
- correct : true si score >= 1.
- feedback : encourageant et utile, EN ${l1Name}, 1 phrase courte.
- corrected : la meilleure version française de SA phrase (corrigée si besoin, sinon sa phrase telle quelle).

Réponds UNIQUEMENT avec un JSON valide (sans markdown) :
{"correct":true,"score":2,"feedback":"...","corrected":"..."}`

  const raw = await callGemini(prompt, 400)
  return JSON.parse(raw) as GradeResult
}
