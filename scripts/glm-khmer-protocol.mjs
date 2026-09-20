#!/usr/bin/env node
/**
 * Protocole de validation khmer pour GLM-5.3-flash (via OpenCode Go) — le "duel" décrit
 * dans la mémoire : comparer le réel éuellement au Gemini prod, avec de vrais messages
 * du bucket + contexte biaisant, pas de messages inventés.
 *
 * Usage : node scripts/glm-khmer-protocol.mjs [N]
 * Pré-requis : .env à la racine du repo (S3_*, OPENCODE_API_KEY), aws cli présent.
 * Lecture seule : aucun trade, aucune écriture disquant du bucket.
 */
import { readFileSync } from 'fs'
import { execSync } from 'child_process'

// ── env du repo lys ──
const ENV = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.startsWith('#')).map(l => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    })
)

const GO_URL = 'https://opencode.ai/zen/go/v1/chat/completions'
const KEY = ENV.OPENCODE_API_KEY
if (!KEY) { console.error('OPENCODE_API_KEY absent du .env'); process.exit(1) }

// ── filets anti-fuite (copiés de vertex.ts : à réveiller REEL produisent identique) ──
const FOREIGN_SCRIPT =
  /[฀-๿ऀ-ॿঀ-৿஀-௿一-鿿㐀-䶿぀-ヿ가-힯ᄀ-ᇿ؀-ۿЀ-ӿ֐-׿]/
const hasForeign = s => FOREIGN_SCRIPT.test(s ?? '')
const translit = s => /\s*[（(][A-Za-zÀ-ÿ0-9'’ .,:;\/-]+[)）]/.test(s ?? '')

// ── coupleContext() — copie conforme du vertex.ts de prod (source de vérité test exact) ──
function coupleContext(author) {
  const isChet = author ? /^(chet|chetana)$/i.test(author.normalize('NFD').replace(/[\u0300-\u036f]/g, '')) : null
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
- "គាត់" = 3ᵉ personne = une AUTRE personne (sa mère, un ami, quelqu'un dont on parle), jamais "tu/toi" ni "je". Utilise le CONTEXTE récent pour choisir "il" ou "elle" et savoir de qui il s'agit.

ÉCRITURE DU KHMER (RÈGLE ABSOLUE) :
- Le texte khmer ("kh") doit être écrit EXCLUSIVEMENT en écriture KHMÈRE (ភាសាខ្មែរ).
- INTERDIT ABSOLU : tout autre système d'écriture — thaï, chinois/japonais, coréen, indien/devanagari, arabe, cyrillique. Uniquement du khmer.
- INTERDIT : toute romanisation / phonétique en lettres latines entre parenthèses dans le khmer.

Message d'auteur = "${author}" — traduis le message ci-dessous.

Réponds UNIQUEMENT avec un JSON valide (sans markdown) :
{"fr":"texte en français","en":"text in English","kh":"អត្ថបទជាភាសាខ្មែរ","lang":"code_langue"}`
}

const chatGo = async (system, user, maxTokens = 2048) => {
  let budget = maxTokens
  for (let i = 0; i < 3; i++) {
    const res = await fetch(GO_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${KEY}`,
        'Content-Type': 'application/json',
        'x-opencode-session': 'lys-khmer-protocol',
      },
      body: JSON.stringify({
        model: 'glm-5.3-flash',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.2,
        max_tokens: budget,
      }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(`${res.status}: ${data?.error?.message ?? 'inconnu'}`)
    const ch = data?.choices?.[0]
    if (ch?.finish_reason === 'length' && budget < 8192) { budget = Math.min(8192, budget * 2); continue }
    return (ch?.message?.content ?? '{}').replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  }
}

// ── messages réels depuis le bucket S3 ──
const N = parseInt(process.argv[2] || '12', 10)
// Attribution comme en prod : accents EVERNorm (Chétana/তানা...)
const normAuthor = (a) => (a?.normalize('NFD').replace(/[\u0300-\u036f]/g, '') ?? '').toLowerCase()
console.log(`— lecture du bucket S3 ($(ENV.GCS_BUCKET_NAME ?? 'chet-lys-coffre')) —`)
let rawChat
try {
  rawChat = execSync(
    `aws s3 ls s3://chet-lys-coffre/chat/2026/09/ --endpoint-url ${ENV.S3_ENDPOINT ?? 'https://s3.fr-par.scw.cloud'} --output text | tail -20`,
    { env: { ...process.env, AWS_ACCESS_KEY_ID: ENV.S3_ACCESS_KEY, AWS_SECRET_ACCESS_KEY: ENV.S3_SECRET_KEY } }
  ).toString()
} catch (e) { console.error('S3 KO:', e.message); process.exit(1) }

const filenames = rawChat.trim().split('\n').map(l => l.split(/\s+/).pop()).filter(f => f?.endsWith('.json'))
if (!filenames.length) { console.error('aucun json dans le bucket'); process.exit(1) }

const messages = []
for (const f of filenames.slice(-4).reverse()) {
  try {
    const raw = execSync(
      `aws s3 cp s3://chet-lys-coffre/chat/2026/09/${f} - --endpoint-url ${ENV.S3_ENDPOINT ?? 'https://s3.fr-par.scw.cloud'}`,
      { env: { ...process.env, AWS_ACCESS_KEY_ID: ENV.S3_ACCESS_KEY, AWS_SECRET_ACCESS_KEY: ENV.S3_SECRET_KEY } }
    ).toString()
    const day = JSON.parse(raw)
    for (const m of (day.messages ?? day ?? [])) {
      if (m?.text?.trim()) messages.push({ author: m.author ?? m.role ?? '?', text: m.text.trim() })
    }
  } catch (e) { console.warn(`passage ${f}: ${e.message.slice(0, 60)}`) }
  if (messages.length >= N) break
}
const sample = []
// alterne les auteurs pour couvrir les deux profils pronoms + contexte biaisant
const byAuthor = { chet: [], lys: [] }
for (const m of messages) {
  const k = normAuthor(m.author).match(/^(chetana|chet)$/) ? 'chet' : 'lys'
  // on garde les messages SOURCES en lettres latines (fr/en) : traduction fr→khmer = le flux prod
  const isLatin = /[A-Za-zÀ-ÿ]/.test(m.text) && !/^[\u1780-\u17FF\s\d.,!?…:;()+-]+$/u.test(m.text)
  if (isLatin && m.text.length > 15) byAuthor[k].push(m.text)
}
const half = Math.ceil(N / 2)
for (let i = 0; i < N; i++) {
  const who = i % 2 === 0 ? 'Chet' : 'Lys'
  const pool = byAuthor[who === 'Chet' ? 'chet' : 'lys']
  if (pool.length) sample.push({ author: who, text: pool.shift() })
}
console.log(`${sample.length} messages réels prélevés (alternance Chet/Lys)\n`)

// ── verdicts + heuristique pronoms ──
const JUDGE = {
  chet: { expectSelfPrefix: /(?:^|\s)(បង)/, forbidSelfPrefix: /(?<!\s)អូន/ },
  lys: { expectSelfPrefix: /(?<!\w)^អូន|[:,]\s*អូន|^\s* TFBang/, forbiddenBang: /(?<!\w)បង/ },
}
function verdictAuto(text, kh, author) {
  const fail = []
  if (kh && FOREIGN_SCRIPT.test(kh)) fail.push('script étranger')
  if (translit(kh)) fail.push('romanisation latine')
  if (!kh || kh.length < 3) fail.push('kh vide')
  const count = (s, re) => (s.match(new RegExp(re.source, 'g')) ?? []).length
  // L'heuristique pronoms ne s'applique qu'aux messages sources avec une 1re personne
  // (les messages 3e personne / "nous" n'ont pas de pronoms à rendre).
  const hasFirstPerson = /\b(je|j'|moi|me\b|i'm|me)\b/i.test(text)
  if (hasFirstPerson) {
    if (author === 'Chet' && !count(kh, /បង/)) fail.push('pas de បង pour le "je" de Chet')
    if (author === 'Lys' && !count(kh, /អូន/)) fail.push('pas de អូន pour le "je" de Lys')
    if (author === 'Lys' && count(kh, /បង/) > 2 && count(kh, /អូន/) === 0) fail.push('suspect inversion: que បง pour un message de Lys')
  }
  return fail
}

let ok = 0
const rows = []
for (const [i, m] of sample.entries()) {
  const [author, text] = [m.author, m.text]
  let kh = '(échec)'
  try {
    const userPrompt = `${text}`
    const out = await chatGo(coupleContext(author), userPrompt)
    kh = (JSON.parse(out).kh ?? '').trim()
  } catch (e) { rows.push([i + 1, author, text.slice(0, 40), '(échec)', e.message.slice(0, 60)]); continue }

  const fail = verdictAuto(text, kh, author)
  if (!fail.length) ok++
  rows.push([i + 1, author, text.slice(0, 40), kh.slice(0, 60), fail.length ? 'FAIL ' + fail.join(', ') : 'OK'])
}

console.log('N° | auteur | message (extrait) | khmer (extrait) | verdict')
for (const r of rows) console.log(`${r[0]}. ${r[1].padEnd(4)} | ${r[2].padEnd(42)} | ${r[3].padEnd(62)} | ${r[4] ?? '—'}`)
console.log(`\n=== Résultat : ${ok}/${rows.length} automatiquement corrects ===`)
