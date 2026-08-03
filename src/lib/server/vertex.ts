import { createSign } from 'crypto'
import { env } from '$env/dynamic/private'

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

const GEMINI_MODELS = ['gemini-3.5-flash-lite', 'gemini-2.5-flash-lite'] as const

function geminiEndpoint(project: string, model: string, location: string): string {
  if (model.startsWith('gemini-3')) {
    return `https://aiplatform.googleapis.com/v1/projects/${project}/locations/global/publishers/google/models/${model}:generateContent`
  }
  return `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:generateContent`
}

async function geminiRequest(parts: object[], maxTokens = 300): Promise<string> {
  const token = await getAccessToken()
  const project = env.VERTEX_PROJECT_ID ?? 'cykt-399216'
  const location = env.VERTEX_LOCATION ?? 'us-central1'

  let lastError: Error | null = null
  for (const model of GEMINI_MODELS) {
    const res = await fetch(geminiEndpoint(project, model, location), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: { temperature: 0.2, maxOutputTokens: maxTokens, thinkingConfig: { thinkingBudget: 0 } },
      }),
    })
    const data = await res.json() as any
    if (!res.ok) {
      console.warn(`[vertex] ${model} failed (${res.status}): ${data?.error?.message ?? 'unknown'}`)
      lastError = new Error(`Gemini ${res.status}: ${data?.error?.message ?? 'unknown'}`)
      continue
    }
    const raw: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}'
    return raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  }
  throw lastError ?? new Error('All Gemini models failed')
}

async function callGemini(prompt: string, maxTokens = 300): Promise<string> {
  return geminiRequest([{ text: prompt }], maxTokens)
}

function coupleContext(author?: string): string {
  const normalized = author?.normalize('NFD').replace(/[\u0300-\u036f]/g, '') ?? ''
  const isChet = author ? /^(chet|chetana)$/i.test(normalized) : null
  const authorLine = isChet === true
    ? `CE MESSAGE est écrit par CHET (homme) : "je/moi" = "បង"(bang), "tu/toi" = "អូន"(oun). Accord MASCULIN pour lui.`
    : isChet === false
      ? `CE MESSAGE est écrit par LYS (femme) : "je/moi" = "អូន"(oun), "tu/toi" = "បង"(bang). Accord FÉMININ pour elle.`
      : ''
  return `CONTEXTE DU COUPLE (à respecter absolument) :
- Chet ("Chetana") = HOMME français. Lys ("Vornsok") = femme cambodgienne.
- En khmer ils s'appellent par des pronoms relationnels intimes : Chet se dit "បង"(bang) et appelle Lys "អូន"(oun) ; Lys se dit "អូន"(oun) et appelle Chet "បង"(bang).
${authorLine}

RENDU DES PRONOMS EN FRANÇAIS ET ANGLAIS (le point le plus important) :
- "អូន"(oun) et "បង"(bang) sont des PRONOMS relationnels, JAMAIS des noms propres. En français/anglais, les rendre par "je/moi" ou "tu/toi" (I/me ou you) selon qui parle — NE JAMAIS écrire "Oun", "Bang" ni "Bong" comme un nom dans le français ou l'anglais.
  Ex : Lys écrit "អូននឹកបង" → "Tu me manques" (PAS "Oun me manque, Bang"). Chet écrit "បងស្រលាញ់អូន" → "Je t'aime" (PAS "Bang aime Oun").
- "គាត់" = 3ᵉ personne = une AUTRE personne (sa mère, un ami, quelqu'un dont on parle), jamais "tu/toi" ni "je". Utilise le CONTEXTE récent pour choisir "il" ou "elle" et savoir de qui il s'agit (ex : si Lys parle de sa mère → "elle").
- Garde TOUJOURS la même personne grammaticale que l'original : un "je" reste "je" (jamais "il/elle" ni un prénom), un "tu" reste "tu".`.trim()
}

export interface Translations { fr: string; en: string; kh: string; lang?: string }

export async function geminiTranslateAll(text: string, author?: string, previousMessage?: string): Promise<Translations> {
  const ctxLine = previousMessage ? `\nCONVERSATION RÉCENTE (contexte pour lever les ambiguïtés de sujet, de genre et d'intention — chaque ligne = "auteur: message") :\n${previousMessage}` : ''
  const prompt = `Tu es un assistant de traduction pour un couple : Chet (français) et Lys (cambodgienne).

${coupleContext(author)}${ctxLine}

Rôle : détecter la langue du message, corriger discrètement les fautes, puis traduire dans les 2 autres langues.

Règles impératives :
- Privilégier l'intention et le registre sur la traduction mot-à-mot
- Registre : intime, oral, tendre — jamais formel ni littéraire
- "គាត់" = il/elle (3ème personne), JAMAIS "tu" — ne jamais confondre avec un interlocuteur direct
- Khmer oral et informel : ហ្នឹង (ça/ce/là), ម្កេះ (peu/seulement), ក្រ- (pénurie/difficulté ex: ក្រញ៉ាំ = manger peu), ម្ហី/ម្ហេ (comment) — privilégier le sens pragmatique, pas la forme écrite standard
- Si le message est court ou ambigu, s'appuyer sur le message précédent pour identifier le sujet et l'intention
- Anglais simple et naturel (Lys apprend — éviter les expressions idiomatiques complexes)
- Un vrai prénom collé à un titre (ex "បង Chet" = "Bang Chet") se garde tel quel ; mais "អូន"/"បង" SEULS sont des pronoms → "je/tu" (voir règle pronoms ci-dessus), jamais des noms
- Le champ de la langue d'origine = le message corrigé tel quel, MÊME personne et MÊME sens (ne le reformule pas, ne change jamais "je" en "il/elle" ni en prénom)
- "lang" : code de la langue détectée du message original ("fr", "en" ou "kh")

Message : "${text}"

Réponds UNIQUEMENT avec un JSON valide (sans markdown) :
{"fr":"texte en français","en":"text in English","kh":"អត្ថបទជាភាសាខ្មែរ","lang":"code_langue"}`

  const raw = await callGemini(prompt, 300)
  return JSON.parse(raw) as Translations
}

export interface LessonItem { original: string; corrected: string; explanation: string }

export interface GeminiSuggestion {
  corrected: string; fr: string; en: string; kh: string; lang: string; question: string; lessons?: LessonItem[]
}

export async function geminiSuggest(text: string, authorLang: 'fr' | 'kh', previousMessage?: string): Promise<GeminiSuggestion> {
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
  const ctxLine = previousMessage ? `\nMESSAGE PRÉCÉDENT (contexte) : "${previousMessage}"` : ''

  const prompt = `Tu es un assistant de traduction pour un couple : Chet (français) et Lys (cambodgienne).
${context}

${coupleContext(author)}${ctxLine}

Rôle : détecter la langue réelle du message, corriger discrètement les fautes, puis traduire dans les 2 autres langues.
Règles :
- Corriger sans dénaturer le sens ni le ton
- Signaler la correction avec une question naturelle dans la langue de l'auteur
- Registre intime, oral et tendre — jamais formel
- "គាត់" = il/elle (3ème personne), JAMAIS "tu" — ne jamais confondre avec un interlocuteur direct
- Khmer oral et informel : ហ្នឹង (ça/là), ម្កេះ (peu/seulement), ក្រ- (pénurie ex: ក្រញ៉ាំ = manger peu), ម្ហី (comment) — sens pragmatique avant forme écrite
- Si le message est court ou ambigu, s'appuyer sur le message précédent pour identifier l'intention
- Si aucune faute, ne mets pas de champ "lessons"
- "lang" : code de la langue détectée ("fr", "en" ou "kh")
${lessonsRule}

Message : "${text}"

Réponds UNIQUEMENT avec un JSON valide (sans markdown) :
{"corrected":"message corrigé","fr":"texte en français","en":"text in English","kh":"អត្ថបទជាភាសាខ្មែរ","lang":"code_langue","question":"${questionHint}"${lessonsHint}}`

  const raw = await callGemini(prompt, 500)
  return JSON.parse(raw) as GeminiSuggestion
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
- Si le message est court ou ambigu, s'appuyer sur le message précédent pour identifier le sujet
- Anglais simple (Lys apprend — éviter les expressions idiomatiques)

Réponds UNIQUEMENT avec un JSON valide (sans markdown) :
{"text":"transcription exacte","fr":"texte en français","en":"text in English","kh":"អត្ថបទជាភាសាខ្មែរ"}`

  const raw = await geminiRequest(
    [{ inlineData: { mimeType, data: audioBase64 } }, { text: prompt }],
    500
  )
  return JSON.parse(raw) as TranscriptionResult
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
