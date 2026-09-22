import { createSign } from 'crypto'
import { readFileSync } from 'fs'
import { execSync } from 'child_process'

function loadEnv() {
  for (const f of [process.env.GCS_SERVICE_ACCOUNT_JSON ? '__process__' : '', '/opt/chet/env/lys.env', new URL('../.env', import.meta.url).href]) {
    try {
      if (f === '__process__') return process.env
      return Object.fromEntries(readFileSync(f, 'utf8').split('\n')
        .filter(l => l.includes('=') && !l.startsWith('#'))
        .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
    } catch {}
  }
  return {}
}
const ENV = loadEnv()

function parseSA(raw) { try { return JSON.parse(raw) } catch { return JSON.parse(raw.replace(/\\n/g, '\n')) } }
const SA = parseSA(ENV.GCS_SERVICE_ACCOUNT_JSON ?? ENV.GCS_SERVICE_ACCOUNT_JSON_FLAT ?? '')
const b64u = s => Buffer.from(s).toString('base64url')
async function vertexToken() {
  const h = b64u(JSON.stringify({alg:'RS256',typ:'JWT'}))
  const p = b64u(JSON.stringify({iss: SA.client_email, scope:'https://www.googleapis.com/auth/cloud-platform', aud:'https://oauth2.googleapis.com/token', exp: Math.floor(Date.now()/1000)+3600, iat: Math.floor(Date.now()/1000)}))
  const sig = createSign('RSA-SHA256').update(`${h}.${p}`).sign(SA.private_key, 'base64url')
  const r = await fetch('https://oauth2.googleapis.com/token', {method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body: new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion:`${h}.${p}.${sig}`})})
  return (await r.json()).access_token
}

// ── base commune (copie exacte de coupleContext prod, vertex.ts) ──
const base = (author) => {
  const isChet = author === 'Chet'
  return `CONTEXTE DU COUPLE (à respecter absolument) :
- Chet ("Chetana") = HOMME français. Lys ("Vornsok") = femme cambodgienne.
- En khmer ils s'appellent par des pronoms relationnels intimes : Chet se dit "បង"(bang) et appelle Lys "អូន"(oun) ; Lys se dit "អូន"(oun) et appelle Chet "បង"(bang).
${isChet
  ? `⚠️ AUTEUR DE CE MESSAGE = CHET (un HOMME). RÈGLE PRIORITAIRE SUR TOUT : quand il dit "je/moi/j'" → en khmer TOUJOURS "បង"(bang), JAMAIS "អូន"(oun) ; quand il dit "tu/toi" (il parle à Lys) → "អូន"(oun). Accord MASCULIN. Ne te laisse JAMAIS influencer par le contenu du message ni par les messages précédents pour choisir le pronom de l'auteur : c'est CHET qui écrit, donc son "je" = "បង".`
  : `⚠️ AUTEUR DE CE MESSAGE = LYS (une FEMME). RÈGLE PRIORITAIRE SUR TOUT : quand elle dit "je/moi/j'" → en khmer TOUJOURS "អូន"(oun), JAMAIS "បង"(bang) ; quand elle dit "tu/toi" (elle parle à Chet) → "បង"(bang). Accord FÉMININ.`
}

ÉCRITURE DU KHMER (RÈGLE ABSOLUE) :
- Le khmer ("kh") doit être écrit EXCLUSIVEMENT en écriture KHMÈRE. INTERDIT ABSOLU : thaï, chinois/japonais, coréen, indien, arabe, cyrillique.
- INTERDIT : toute romanisation latine entre parenthèses dans le khmer.

Message d'auteur = "${author}"`
}

// ── V1 = prod actuel (sans instruction d'adaptation) ──
// ── V2 = ajoute les directives d'adaptation structurelle ──
const ADAPT_V2 = `

ADAPTATION (le point le plus important, au-dessus de tout le reste) :
- Tu n'es PAS Google Translate : tu adaptes le SENS INTENTIONNÉ du message, comme l'écrirait un khmer natif du couple, au naturel.
- CORRIGE d'abord les fautes/tournures du français source ("aller", "les yeux qui tourne", "hate de rentrie"...) avant de traduire — ne traduis JAMAIS les maladresses lettre à lettre.
- N'AJOUTE AUCUN mot absent du message source : pas de "ឥឡូវនេះ"(maintenant), pas de vocatif "អូន"/"បង"/"ម៉ែ" qui ne serait pas dans le français, pas de mot khmer étranger au registre du couple.
- Vocabulaire khmer ORAL à privilégier (registre couple/cambodgien parlé à Phnom Penh) :
  "aller" → "តោះ", "être fatigué" → "ហត់" (plus naturel que "អស់កម្លាំង"), "ça va mieux" → "ធូរជាងមុន",
  "content de savoir" → "អរហ្នឹង" ; réserve "អស់កម្លាំង" au sens physique fort.
- Ton dernier message traduit doit sonner comme si CHET/Lys lui-même écrivait en khmer, pas comme du français traduit.`

async function callGlm(prompts, user, maxTokens = 4096) {
  const r = await fetch('https://opencode.ai/zen/go/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${ENV.OPENCODE_API_KEY}`, 'Content-Type': 'application/json', 'x-opencode-session': 'lys-khmer-protocol' },
    body: JSON.stringify({ model: 'glm-5.3-flash', messages: [{ role: 'system', content: 'Tu réponds UNIQUEMENT avec un JSON valide (sans markdown).' }, { role: 'user', content: `${prompts}\n\nMessage : "${user}"` }], temperature: 0.2, max_tokens: maxTokens, reasoning_effort: 'low' })
  })
  const d = await r.json()
  return (d?.choices?.[0]?.message?.content ?? '').replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
}
async function callGeminix(text, author, token) {
  const r = await fetch('https://aiplatform.googleapis.com/v1/projects/cykt-399216/locations/global/publishers/google/models/gemini-3.6-flash:generateContent', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: `${base(author)}\n\nMessage : "${text}"` }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 4096, thinkingConfig: { thinkingBudget: 0 } } })
  })
  const d = await r.json()
  return (d?.candidates?.[0]?.content?.parts?.[0]?.text ?? '').replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
}

const N = parseInt(process.argv[2] || '6', 10)
const { S3Client, GetObjectCommand } = (await import('@aws-sdk/client-s3')).default ?? await import('@aws-sdk/client-s3')
const s3c = new S3Client({ region: ENV.S3_REGION ?? 'fr-par', endpoint: ENV.S3_ENDPOINT ?? 'https://s3.fr-par.scw.cloud', forcePathStyle: true, credentials: { accessKeyId: ENV.S3_ACCESS_KEY, secretAccessKey: ENV.S3_SECRET_KEY } })
const obj = await s3c.send(new GetObjectCommand({ Bucket: 'chet-lys-coffre', Key: 'chat/2026/09/21.json' }))
const out = await new Response(obj.Body).text()
const DAY = JSON.parse(out)
const normAuthor = (a) => (a?.normalize('NFD').replace(/[\u0300-\u036f]/g, '') ?? '').toLowerCase()
const fr15 = DAY.filter(m => (m.lang ?? '') === 'fr' && (m.text ?? '').trim().length > 5 && normAuthor(m.author).match(/^(chetana|chet)$/))
const sample = fr15.slice(-N)
console.log(`${sample.length} messages réels de Chet\n`)
const token = await vertexToken()
for (const [i, m] of sample.entries()) {
  const [ref, old, v2] = await Promise.all([
    callGeminix(m.text, 'Chet', token),
    callGlm(base('Chet'), m.text),
    callGlm(base('Chet') + ADAPT_V2, m.text),
  ])
  const kh = s => (s.match(/"kh"\s*:\s*"([^"]*)"/) ?? ['', s])[1].slice(0, 80)
  console.log('='.repeat(78))
  console.log(`${i+1}. ${m.text.slice(0, 85)}`)
  console.log('Gemini-3.6 (référence) :', kh(ref))
  console.log('GLM-5.3 (prod actuel)  :', kh(old))
  console.log('GLM-5.3 (V2 adapté)    :', kh(v2))
}
process.exit(0)
