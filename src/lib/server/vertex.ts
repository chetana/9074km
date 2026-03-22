import { createSign } from 'crypto'

export async function getAccessToken(): Promise<string> {
  const raw = process.env.GCS_SERVICE_ACCOUNT_JSON!.trim()
  const creds = JSON.parse(raw)
  creds.private_key = (creds.private_key as string).replace(/\\n/g, '\n').trim() + '\n'

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

const GEMINI_MODELS = ['gemini-3-flash-preview', 'gemini-2.5-flash'] as const

function geminiEndpoint(project: string, model: string, location: string): string {
  if (model.startsWith('gemini-3')) {
    return `https://aiplatform.googleapis.com/v1/projects/${project}/locations/global/publishers/google/models/${model}:generateContent`
  }
  return `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:generateContent`
}

async function geminiRequest(parts: object[], maxTokens = 300): Promise<string> {
  const token = await getAccessToken()
  const project = process.env.VERTEX_PROJECT_ID ?? 'cykt-399216'
  const location = process.env.VERTEX_LOCATION ?? 'us-central1'

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
    ? `Ce message est écrit par CHET (homme). Dans la traduction khmère : "je/me/moi" → "bang" (បង) OBLIGATOIRE, jamais "oun" ni "knhom".`
    : isChet === false
      ? `Ce message est écrit par LYS (femme). Dans la traduction khmère : "je/me/moi" → "oun" (អូន) OBLIGATOIRE, jamais "bang".`
      : ''
  return `CONTEXTE DU COUPLE (respecter impérativement) :
- Chet (aussi appelé "Chetana") est un HOMME français. Accord MASCULIN obligatoire pour ses messages.
- Lys (aussi appelée "Vornsok") est une femme cambodgienne.
- Pronoms khmer : quand Chet écrit → il se dit "bang" (បង), appelle Lys "oun" (អូន). Quand Lys écrit → elle se dit "oun" (អូន), appelle Chet "bang" (បង).
${authorLine}`.trim()
}

export interface Translations { fr: string; en: string; kh: string; lang?: string }

export async function geminiTranslateAll(text: string, author?: string): Promise<Translations> {
  const prompt = `Tu es un assistant de traduction pour un couple : Chet (français) et Lys (cambodgienne).

${coupleContext(author)}

Rôle : détecter la langue du message, corriger discrètement les fautes, puis traduire dans les 2 autres langues.
Règles : privilégier le sens et l'intention, jamais le mot-à-mot. Garder le registre naturel et intime.
"lang" : code de la langue détectée du message original ("fr", "en" ou "kh").

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

export async function geminiSuggest(text: string, authorLang: 'fr' | 'kh'): Promise<GeminiSuggestion> {
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

  const prompt = `Tu es un assistant de traduction pour un couple : Chet (français) et Lys (cambodgienne).
${context}

${coupleContext(author)}

Rôle : détecter la langue réelle du message, corriger discrètement les fautes, puis traduire dans les 2 autres langues.
Règles :
- Corriger sans dénaturer le sens ni le ton
- Signaler la correction avec une question naturelle dans la langue de l'auteur
- Registre intime et tendre
- Si aucune faute, ne mets pas de champ "lessons"
- "lang" : code de la langue détectée ("fr", "en" ou "kh")
${lessonsRule}

Message : "${text}"

Réponds UNIQUEMENT avec un JSON valide (sans markdown) :
{"corrected":"message corrigé","fr":"texte en français","en":"text in English","kh":"អត្ថបទជាភាសាខ្មែរ","lang":"code_langue","question":"${questionHint}"${lessonsHint}}`

  const raw = await callGemini(prompt, 500)
  return JSON.parse(raw) as GeminiSuggestion
}

export interface TranscriptionResult { text: string; fr: string; en: string; kh: string }

export async function geminiTranscribeAndTranslate(audioBase64: string, mimeType: string, author?: string): Promise<TranscriptionResult> {
  const prompt = `Transcris EXACTEMENT ce qui est dit dans ce message vocal, mot pour mot, sans rien ajouter ni inventer.
Détecte la langue (français, anglais ou khmer).
Traduis ensuite dans les 2 autres langues (traduction courte et fidèle au message d'origine).

${coupleContext(author)}

Réponds UNIQUEMENT avec un JSON valide (sans markdown) :
{"text":"transcription exacte","fr":"texte en français","en":"text in English","kh":"អត្ថបទជាភាសាខ្មែរ"}`

  const raw = await geminiRequest(
    [{ inlineData: { mimeType, data: audioBase64 } }, { text: prompt }],
    500
  )
  return JSON.parse(raw) as TranscriptionResult
}
