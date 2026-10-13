#!/usr/bin/env node --experimental-strip-types
/**
 * Audit a posteriori des traductions STOCKÉES du chat — attrape les erreurs sémantiques que les
 * garde-fous de prod (khmer-guards.ts) ne voient pas (ex : « អូនលក់ដាច់ណាស់ » = « j'ai très bien
 * vendu » stocké « j'ai dormi profondément », 12-13/10/2026).
 *
 * Principe : pour chaque message, Gemini produit une traduction de RÉFÉRENCE (source khmer → fr,
 * ou rétro-traduction du kh stocké → fr pour une source fr), puis un 2e appel JUGE compare la
 * traduction stockée à la référence et au texte d'origine : ok / nuance / faux.
 *
 * Usage :
 *   node --experimental-strip-types scripts/audit-translations.mjs [--days 7] [--date 2026-10-12]
 *        [--file chat.json ...] [--max 200] [--json /chemin/rapport.json]
 *
 *   --days N     N derniers jours jusqu'à aujourd'hui (défaut 7) ; --date AAAA-MM-JJ : ce jour seul
 *   --file F     fichier chat local (répétable) au lieu de S3 — pour rejouer une copie sauvegardée
 *   --max N      plafond de messages audités (défaut 200, les plus récents gardés)
 *   --json F     écrit le rapport dans F (jamais dans le repo par défaut)
 *
 * LECTURE SEULE : aucune écriture S3/DB. Coûte de vrais appels Vertex (2 par message, ~0,001 $
 * le message avec gemini-3.6-flash) — à lancer à la main, jamais en CI.
 */
import { readFileSync, writeFileSync } from 'fs'
import { execSync } from 'child_process'
import { createSign } from 'crypto'

const ENV = Object.fromEntries(
	readFileSync(new URL('../.env', import.meta.url), 'utf8')
		.split('\n').filter(l => l.includes('=') && !l.startsWith('#')).map(l => {
			const i = l.indexOf('=')
			return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
		})
)

const MODEL = 'gemini-3.6-flash'
// $ par million de tokens (entrée, sortie) — mêmes tarifs que bench-gemini-models.mjs.
const PRICES = {
	'gemini-2.5-flash-lite': [0.10, 0.40],
	'gemini-2.5-flash': [0.30, 2.50],
	'gemini-3.1-flash-lite': [0.25, 1.50],
	'gemini-3.6-flash': [0.75, 3.75],
	'gemini-3.7-flash': [0.75, 3.75],
	'gemini-3.8-flash': [0.75, 3.75],
}

function parseServiceAccountJson(raw) {
	let fixed = '', inString = false, i = 0
	while (i < raw.length) {
		if (inString && raw[i] === '\\') { fixed += raw[i++]; if (i < raw.length) fixed += raw[i++]; continue }
		if (raw[i] === '"') inString = !inString
		if (!inString && raw[i] === '\\' && raw[i + 1] === 'n') { i += 2; continue }
		fixed += raw[i++]
	}
	const c = JSON.parse(fixed)
	c.private_key = c.private_key.replace(/\\n/g, '\n').trim() + '\n'
	c.client_email = c.client_email.trim()
	return c
}

async function getAccessToken() {
	const c = parseServiceAccountJson(ENV.GCS_SERVICE_ACCOUNT_JSON)
	const now = Math.floor(Date.now() / 1000)
	const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url')
	const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: c.client_email, scope: 'https://www.googleapis.com/auth/cloud-platform', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`
	const sig = createSign('RSA-SHA256').update(unsigned).sign(c.private_key, 'base64url')
	const r = await fetch('https://oauth2.googleapis.com/token', {
		method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${sig}` }),
	})
	return (await r.json()).access_token
}

const PROJECT = ENV.VERTEX_PROJECT_ID ?? 'cykt-399216'
const LOCATION = ENV.VERTEX_LOCATION ?? 'us-central1'
function endpoint(model) {
	return model.startsWith('gemini-3')
		? `https://aiplatform.googleapis.com/v1/projects/${PROJECT}/locations/global/publishers/google/models/${model}:generateContent`
		: `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT}/locations/${LOCATION}/publishers/google/models/${model}:generateContent`
}

const usage = { calls: 0, tin: 0, tout: 0, errors: 0 }

async function callGemini(token, model, system, user, budget) {
	for (let attempt = 0; attempt < 4; attempt++) {
		const r = await fetch(endpoint(model), {
			method: 'POST',
			headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({
				systemInstruction: { parts: [{ text: system }] },
				contents: [{ role: 'user', parts: [{ text: user }] }],
				generationConfig: { temperature: 0.2, maxOutputTokens: budget, thinkingConfig: { thinkingBudget: 0 }, responseMimeType: 'application/json' },
			}),
		})
		const d = await r.json()
		usage.calls++
		if (r.status === 429) { await new Promise(res => setTimeout(res, 4000 * (attempt + 1))); continue }
		if (!r.ok) return { error: `${r.status} ${(d?.error?.message ?? '').slice(0, 120)}` }
		const cand = d?.candidates?.[0]
		const u = d?.usageMetadata ?? {}
		usage.tin += u.promptTokenCount ?? 0
		usage.tout += u.candidatesTokenCount ?? 0
		if (cand?.finishReason === 'MAX_TOKENS' && budget < 4096) { budget *= 2; continue }
		const raw = (cand?.content?.parts?.[0]?.text ?? '').replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
		try { return { json: JSON.parse(raw) } } catch { return { error: `JSON invalide : ${raw.slice(0, 80)}` } }
	}
	return { error: '429 persistant' }
}

const REF_SYSTEM_KM = `Tu es traducteur khmer → français pour un couple (Chet, français, et Lys, cambodgienne). Traduis le message khmer en français de façon FIDÈLE, au registre oral intime d'un couple. N'ajoute rien, ne retire rien, n'adoucis pas, ne reformule pas. Si un mot est ambigu, choisis le sens le plus plausible dans la phrase. Réponds en JSON : {"fr": "..."}`
const REF_SYSTEM_BACK = `Tu es traducteur khmer → français. Traduis fidèlement ce texte khmer en français, sans rien ajouter ni retirer, au registre oral intime d'un couple. Tu ne connais pas le texte d'origine : ne devine pas, traduis seulement ce qui est écrit. Réponds en JSON : {"fr": "..."}`
const JUDGE_SYSTEM = `Tu audites la traduction d'un chat de couple franco-khmer. On te donne le texte d'ORIGINE, la traduction STOCKÉE (à juger) et une traduction de RÉFÉRENCE indépendante (en français).
Compare le SENS de la traduction stockée à l'origine et à la référence (pas le style, pas la ponctuation, pas les emojis, pas le tutoiement/vouvoiement neutre).
- "ok" : même sens.
- "nuance" : perte ou ajout léger de sens, registre ou intensité différents, détail omis.
- "faux" : sens inversé, contresens, mot confondu (ex : vendre ↔ dormir), information inventée ou perdue qui change le message.
En cas de désaccord entre stockée et référence, tranche d'après l'origine : si la référence se trompe et la stockée est juste, réponds "ok".
Réponds en JSON : {"verdict": "ok"|"nuance"|"faux", "raison": "courte, en français", "terme_khmer_en_cause": "le mot/l'expression KHMER en cause, en écriture khmer (si faux/nuance ; si l'origine est française, le mot khmer fautif de la traduction stockée)", "correction_proposee": "sens correct de CE TERME seul, en français, 2-6 mots (si faux)", "correction_en": "idem en anglais (si faux)"}
Les champs terme/correction décrivent un terme précis, jamais la phrase entière ni du khmer dans les corrections.`

const args = process.argv.slice(2)
const opt = (name, dflt) => { const i = args.indexOf(name); return i === -1 ? dflt : args[i + 1] }
const optAll = (name) => args.flatMap((a, i) => a === name ? [args[i + 1]] : [])
const days = parseInt(opt('--days', '7'), 10)
const dateArg = opt('--date', null)
const files = optAll('--file')
const max = parseInt(opt('--max', '200'), 10)
const jsonOut = opt('--json', null)

const isKhmer = s => /[ក-៿]/.test(s ?? '')
const normAuthor = a => (a?.normalize('NFD').replace(/[̀-ͯ]/g, '') ?? '').toLowerCase()
const authorName = a => /^(chetana|chet)$/.test(normAuthor(a)) ? 'Chet' : 'Lys'

function loadDay(day) {
	const path = day.replace(/-/g, '/')
	try {
		const out = execSync(
			`aws s3 cp s3://chet-lys-coffre/chat/${path}.json - --endpoint-url ${ENV.S3_ENDPOINT ?? 'https://s3.fr-par.scw.cloud'}`,
			{ env: { ...process.env, AWS_ACCESS_KEY_ID: ENV.S3_ACCESS_KEY, AWS_SECRET_ACCESS_KEY: ENV.S3_SECRET_KEY }, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 << 20 }
		).toString()
		return JSON.parse(out)
	} catch { return null }
}

const sources = []
if (files.length) {
	for (const f of files) sources.push({ day: f.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? f, msgs: JSON.parse(readFileSync(f, 'utf8')) })
} else {
	const list = []
	if (dateArg) list.push(dateArg)
	else for (let i = days - 1; i >= 0; i--) list.push(new Date(Date.now() - i * 864e5).toISOString().slice(0, 10))
	for (const day of list) { const msgs = loadDay(day); if (msgs) sources.push({ day, msgs }) }
}

let items = sources.flatMap(({ day, msgs }) => msgs
	.filter(m => (m.text ?? '').trim().length > 3 && !m.deleted)
	.map(m => {
		const text = m.text.trim()
		const srcKh = isKhmer(text)
		return { date: day, id: m.id, author: authorName(m.author), text, srcKh, stored: (srcKh ? m.fr : m.kh) ?? '', storedLabel: srcKh ? 'fr' : 'kh' }
	})
	.filter(it => it.stored.trim()))
const total = items.length
if (items.length > max) items = items.slice(-max)
console.log(`${sources.length} jour(s) lu(s), ${total} message(s) à auditer${total > max ? `, plafonné aux ${max} derniers (--max)` : ''}. Modèle : ${MODEL}\n`)

const token = await getAccessToken()

async function audit(it) {
	const ref = it.srcKh
		? await callGemini(token, MODEL, REF_SYSTEM_KM, `Auteur : ${it.author}\nMessage khmer :\n${it.text}`, 512)
		: await callGemini(token, MODEL, REF_SYSTEM_BACK, `Texte khmer :\n${it.stored}`, 512)
	if (ref.error) return { ...it, error: `référence : ${ref.error}` }
	const reference = String(ref.json.fr ?? '')
	const user = `Auteur : ${it.author}\nTexte d'ORIGINE (${it.srcKh ? 'khmer' : 'français'}) :\n${it.text}\n\nTraduction STOCKÉE (${it.srcKh ? 'français' : 'khmer'}) :\n${it.stored}\n\nRéférence (français${it.srcKh ? '' : ', rétro-traduction du khmer stocké'}) :\n${reference}`
	const j = await callGemini(token, MODEL, JUDGE_SYSTEM, user, 512)
	if (j.error) return { ...it, reference, error: `juge : ${j.error}` }
	const verdict = ['ok', 'nuance', 'faux'].includes(j.json.verdict) ? j.json.verdict : 'nuance'
	return { ...it, reference, verdict, raison: j.json.raison ?? '', terme: j.json.terme_khmer_en_cause ?? '', correction: j.json.correction_proposee ?? '', correction_en: j.json.correction_en ?? '' }
}

// Concurrence ≤ 4 (un message = 2 appels séquentiels).
const results = new Array(items.length)
let next = 0
await Promise.all(Array.from({ length: Math.min(4, items.length) }, async () => {
	while (next < items.length) { const i = next++; results[i] = await audit(items[i]) }
}))

const rank = { faux: 0, nuance: 1, ok: 2 }
const sorted = results.filter(r => !r.error).sort((a, b) => rank[a.verdict] - rank[b.verdict] || a.date.localeCompare(b.date))
const errs = results.filter(r => r.error)
const count = v => sorted.filter(r => r.verdict === v).length

for (const r of sorted.filter(r => r.verdict !== 'ok')) {
	console.log(`[${r.verdict.toUpperCase()}] ${r.date} ${r.author} (source ${r.srcKh ? 'khmer' : 'fr'})`)
	console.log(`   texte     : ${r.text}`)
	console.log(`   stockée   : ${r.stored}  (${r.storedLabel})`)
	console.log(`   référence : ${r.reference}`)
	console.log(`   raison    : ${r.raison}${r.terme ? `  [terme : ${r.terme}]` : ''}\n`)
}
console.log(`ok : ${count('ok')}   nuance : ${count('nuance')}   faux : ${count('faux')}   erreurs d'appel : ${errs.length}`)
for (const e of errs) console.log(`   erreur ${e.date} ${e.id} : ${e.error}`)

const fauxList = sorted.filter(r => r.verdict === 'faux' && r.terme)
if (fauxList.length) {
	console.log('\nEntrées de glossaire proposées (à valider à la main, rien n\'est appliqué) :')
	const seen = new Set()
	for (const r of fauxList) {
		if (seen.has(r.terme)) continue
		seen.add(r.terme)
		console.log(`   ${r.terme}  →  fr : ${r.correction || '?'}  |  en : ${r.correction_en || '?'}`)
	}
}

const [pin, pout] = PRICES[MODEL] ?? [0, 0]
const cost = (usage.tin * pin + usage.tout * pout) / 1e6
console.log(`\n${usage.calls} appels Gemini (${MODEL}), ${usage.tin} tok in / ${usage.tout} tok out, coût estimé ≈ ${cost.toFixed(4)} $`)

if (jsonOut) {
	writeFileSync(jsonOut, JSON.stringify({ model: MODEL, counts: { ok: count('ok'), nuance: count('nuance'), faux: count('faux'), erreurs: errs.length }, calls: usage.calls, cost_usd: cost, results: [...sorted, ...errs] }, null, 2))
	console.log(`Rapport écrit : ${jsonOut}`)
}
