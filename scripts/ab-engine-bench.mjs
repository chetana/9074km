#!/usr/bin/env node
/**
 * A/B GLM (OpenCode Go) vs Gemini-3.6-flash (Vertex prod actuel en backup) sur les VRAIS
 * messages du couple (bucket S3), avec le prompt de prod (coupleContext) et le contexte
 * précédent. Sortie côte à côte pour jugement humain (Lys/Chetana).
 * Usage : node scripts/ab-engine-bench.mjs [N]
 */
import { createSign } from 'crypto'
import { readFileSync } from 'fs'
import { execSync } from 'child_process'

const ENV = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.startsWith('#')).map(l => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    })
)

// ── Vertex (SA JWT → generateContent) ──
function parseSA(raw) { let s = raw.replace(/\\n/g, '\n'); try { return JSON.parse(s) } catch { return JSON.parse(s.replace(/(?<="[:\[]\s*)\\?[“”\"]|\\?[“”\"](?=\s*[,}])/g, '"')) } }
const SA = (function(){ try { return JSON.parse(ENV.GCS_SERVICE_ACCOUNT_JSON ?? '') } catch (e) { return null } })()
if (!SA) { console.error('GCS_SERVICE_ACCOUNT_JSON absent/malformé dans .env'); process.exit(1) }
const b64u = s => Buffer.from(s).toString('base64url')
async function vertexToken() {
  const h = b64u(JSON.stringify({alg:'RS256',typ:'JWT'}))
  const p = b64u(JSON.stringify({iss: SA.client_email, scope:'https://www.googleapis.com/auth/cloud-platform', aud:'https://oauth2.googleapis.com/token', exp: Math.floor(Date.now()/1000)+3600, iat: Math.floor(Date.now()/1000)}))
  const sig = createSign('RSA-SHA256').update(`${h}.${p}`).sign(SA.private_key, 'base64url')
  const r = await fetch('https://oauth2.googleapis.com/token', {method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body: new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion:`${h}.${p}.${sig}`})})
  return (await r.json()).access_token
}

// ── coupleContext (copie prod exacte, la même que vertex.ts) ──
const ctx = (author) => [
  'CONTEXTE DU COUPLE (à respecter absolument) :',
  '- Chet ("Chetana") = HOMME français. Lys ("Vornsok") = femme cambodgienne.',
  '- En khmer ils s\'appellent par des pronoms relationnels intimes : Chet se dit "បង"(bang) et appelle Lys "អូន"(oun) ; Lys se dit "អូន"(oun) et appelle Chet "បង"(bang).',
  author === 'Chet'
    ? `⚠️ AUTEUR DE CE MESSAGE = CHET (un HOMME). "je" → "បង". "tu" → "អូន". Accord MASCULIN.`
    : author === 'Lys'
      ? `⚠️ AUTEUR DE CE MESSAGE = LYS (une FEMME). "je" → "អូន". "tu" → "បង". Accord FÉMININ.`
      : '',
  'ADAPTATION CONTEXTUELLE (pas une traduction littérale) :',
  '- Première priorité = le SENS que Lys/Chet veut VRAIMENT transmettre à son partenaire. Reformulate naturellement comme l\'écrirait un khmer natif du couple au quotidien.',
  '- Khmer oral et informel (ហ្នឹង, ម្កេះ, ក្រ-), pas le khmer écrit formel/littéraire.',
  '- S\'appuyer sur le contexte et le registre intime du couple (pronoms relationnels).',
  '- CORRIGER les fautes/tournures maladroites du français source avant de traduire (ne pas traduire les maladresses lettre à lettre).',
  '- "គាត់" = 3ᵉ personne (une autre personne), jamais je/tu.',
  `- INTERDIT : thaï, chinois/japonais, coréen, indien, arabe, cyrillique dans le kh. Uniquement l écriture khmère.`,
  `- INTERDIT : romanisation latine entre parenthèses dans le khmer.`,
  'Réponds UNIQUEMENT avec un JSON valide (sans markdown) : {"fr":"...","en":"...","kh":"...","lang":"code"}'
].filter(Boolean).join('\n')

async function viaVertex(text, author, token) {
  const r = await fetch('https://aiplatform.googleapis.com/v1/projects/cykt-399216/locations/global/publishers/google/models/gemini-3.6-flash:generateContent', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: `${ctx(author)}\n\nMessage : "${text}"` }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 4096, thinkingConfig: { thinkingBudget: 0 } } })
  })
  const d = await r.json()
  if (!r.ok) return `[ERR ${r.status} ${d?.error?.message?.slice(0,80)}]`
  return (d?.candidates?.[0]?.content?.parts?.[0]?.text ?? '').replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
}
async function viaGlm(text, author) {
  const r = await fetch('https://opencode.ai/zen/go/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${ENV.OPENCODE_API_KEY}`, 'Content-Type': 'application/json', 'x-opencode-session': 'lys-khmer-protocol' },
    body: JSON.stringify({ model: 'glm-5.3-flash', messages: [{ role: 'system', content: 'Tu réponds UNIQUEMENT avec un JSON valide (sans markdown).' }, { role: 'user', content: `${ctx(author)}\n\nMessage : "${text}"` }], temperature: 0.2, max_tokens: 4096, reasoning_effort: 'low' })
  })
  const d = await r.json()
  if (!r.ok) return `[ERR ${r.status} ${JSON.stringify(d).slice(0, 80)}]`
  return (d?.choices?.[0]?.message?.content ?? '').replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
}

// ── tire les N derniers messages en fr du bucket ──
const N = parseInt(process.argv[2] || '6', 10)
const out = execSync(
  `aws s3 cp s3://chet-lys-coffre/chat/2026/09/21.json - --endpoint-url ${ENV.S3_ENDPOINT ?? 'https://s3.fr-par.scw.cloud'}`,
  { env: { ...process.env, AWS_ACCESS_KEY_ID: ENV.S3_ACCESS_KEY, AWS_SECRET_ACCESS_KEY: ENV.S3_SECRET_KEY } }
).toString()
const DAY = JSON.parse(out)
console.error('DEBUG: total', DAY.length)
// messages sources latins (fr), en ordre chronologique croissant, avec auteur dé-accentué
const normAuthor = (a) => (a?.normalize('NFD').replace(/[\u0300-\u036f]/g, '') ?? '').toLowerCase()
const all = DAY
  .filter(m => (m.lang ?? '') === 'fr' || /^[A-Za-zÀ-ÿ\d\s.,!?…:;'’"()+-]+$/.test(m.text ?? ''))
  .filter(m => (m.text ?? '').trim().length > 15)
  .map(m => ({ author: normAuthor(m.author).match(/^(chetana|chet)$/) ? 'Chet' : 'Lys', text: (m.text ?? '').trim() }))
console.error('DEBUG all:', all.length, '| auteurs:', JSON.stringify([...new Set(all.map(m=>m.author))]))
const sample = all.filter(m => m.author === 'Chet').slice(-N)
console.log(`${sample.length} messages retenus\n`)
const token = await vertexToken()
for (const [i, m] of sample.entries()) {
  const [g, k] = await Promise.all([viaVertex(m.text, m.author, token), viaGlm(m.text, m.author)])
  const clean = s => (s.match(/"kh"\s*:\s*"([^"]*)"/) ?? ['', s])[1]
  console.log('=' .repeat(78))
  console.log(`${i+1}. [${m.author}] ${m.text.slice(0, 90)}`)
  console.log('   Gemini-3.6 :', clean(g).slice(0, 70) || g.slice(0, 70))
  console.log('   GLM-5.3    :', clean(k).slice(0, 70) || k.slice(0, 70))
}
process.exit(0)
