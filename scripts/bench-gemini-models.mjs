#!/usr/bin/env node --experimental-strip-types
/**
 * Banc de comparaison des modèles Gemini (Vertex AI) sur la traduction khmère du couple — pour
 * choisir un modèle AVANT de toucher COUPLE_MODELS/STRONG_MODELS/GEMINI_MODELS dans vertex.ts.
 * Ne jamais suivre la table de migration de Google sans ce banc : gemini-3.5-flash-lite, qu'elle
 * recommandait, ratait les pronoms et glissait vers le thaï.
 *
 * Même prompt (buildTranslateSystem/User importés de khmer-guards.ts), mêmes paramètres de requête
 * que geminiRequest() en prod (température 0.2, thinkingBudget 0, endpoint global pour gemini-3*),
 * même validation (pickTranslation) et mêmes garde-fous que l'escalade de prod.
 *
 * Usage :
 *   node --experimental-strip-types scripts/bench-gemini-models.mjs gemini-3.6-flash gemini-3.8-flash [--runs 2] [--out rapport.json]
 *
 * Lecture seule, coûte de vrais appels Vertex (~24 cas × runs × modèles) — jamais en CI.
 */
import { readFileSync, writeFileSync } from 'fs'
import { createSign } from 'crypto'
import {
	buildTranslateSystem, buildTranslateUser, translateBudget, pickTranslation, termsEchoed,
	containsForeignScript, containsGluedLatin, glossaryEchoed, numbersPreserved, detectIsChet,
} from '../src/lib/server/khmer-guards.ts'
import { REGRESSION_CASES, PRONOUN_CASES } from './translate-cases.mjs'

const ENV = Object.fromEntries(
	readFileSync(new URL('../.env', import.meta.url), 'utf8')
		.split('\n').filter(l => l.includes('=') && !l.startsWith('#')).map(l => {
			const i = l.indexOf('=')
			return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
		})
)

// $ par million de tokens (entrée, sortie). Sources : mail Google Cloud du 12/09/2026 (mémoire
// gemini-retirement-2027) et grille publique Vertex. Tarif de lancement des 3.6/3.7/3.8-flash
// valable jusqu'au 31/12/2026, il double au 01/01/2027. Prix inconnu → coût non estimé.
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

async function callGemini(token, model, system, user, budget) {
	const t0 = Date.now()
	for (let attempt = 0; attempt < 3; attempt++) {
		const r = await fetch(endpoint(model), {
			method: 'POST',
			headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({
				systemInstruction: { parts: [{ text: system }] },
				contents: [{ role: 'user', parts: [{ text: user }] }],
				generationConfig: { temperature: 0.2, maxOutputTokens: budget, thinkingConfig: { thinkingBudget: 0 } },
			}),
		})
		const d = await r.json()
		if (r.status === 429) { await new Promise(res => setTimeout(res, 4000 * (attempt + 1))); continue }
		if (!r.ok) return { error: `${r.status} ${(d?.error?.message ?? '').slice(0, 120)}`, ms: Date.now() - t0 }
		const cand = d?.candidates?.[0]
		if (cand?.finishReason === 'MAX_TOKENS' && budget < 8192) { budget = Math.min(8192, budget * 2); continue }
		const raw = (cand?.content?.parts?.[0]?.text ?? '').replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
		const u = d?.usageMetadata ?? {}
		return { raw, finish: cand?.finishReason, ms: Date.now() - t0, tin: u.promptTokenCount ?? 0, tout: u.candidatesTokenCount ?? 0 }
	}
	return { error: '429 persistant', ms: Date.now() - t0 }
}

async function benchModel(token, model, cases, runs) {
	const rows = []
	for (const c of cases) {
		const system = buildTranslateSystem(c.author)
		const user = buildTranslateUser(c.text, c.context)
		const isChet = detectIsChet(c.author)
		for (let run = 1; run <= runs; run++) {
			const res = await callGemini(token, model, system, user, translateBudget(c.text, 4))
			const row = { model, case: c.name, author: c.author, text: c.text, run, ms: res.ms, tin: res.tin ?? 0, tout: res.tout ?? 0 }
			if (res.error) { rows.push({ ...row, error: res.error, caseOk: false, guardsOk: false }); continue }
			let t
			try { t = pickTranslation(res.raw) } catch (e) {
				rows.push({ ...row, error: `forme (fin=${res.finish}): ${e.message}`, raw: res.raw.slice(0, 300), caseOk: false, guardsOk: false }); continue
			}
			const flags = {
				foreign: containsForeignScript(t.kh),
				glued: containsGluedLatin(t.kh),
				terms: !termsEchoed(t, c.text),
				glossary: !glossaryEchoed(c.text, t, isChet),
				numbers: !numbersPreserved(c.text, t.kh),
			}
			const guardsOk = !Object.values(flags).some(Boolean) // la prod l'aurait accepté sans escalade
			const caseOk = c.check(t.kh, c.text) && (c.checkFrEn ? c.checkFrEn(t.fr, t.en) : true)
			rows.push({ ...row, fr: t.fr, en: t.en, kh: t.kh, terms: t.terms, flags, guardsOk, caseOk })
		}
	}
	return rows
}

const args = process.argv.slice(2)
const opt = (name, dflt) => { const i = args.indexOf(name); return i === -1 ? dflt : args[i + 1] }
const runs = parseInt(opt('--runs', '2'), 10)
const out = opt('--out', null)
const models = args.filter((a, i) => !a.startsWith('--') && !['--runs', '--out'].includes(args[i - 1]))
if (!models.length) { console.error('Usage : bench-gemini-models.mjs <modèle...> [--runs N] [--out fichier.json]'); process.exit(1) }

const cases = [...REGRESSION_CASES, ...PRONOUN_CASES]
console.log(`${models.length} modèles × ${cases.length} cas × ${runs} essais = ${models.length * cases.length * runs} appels\n`)
const token = await getAccessToken()
const all = (await Promise.all(models.map(m => benchModel(token, m, cases, runs)))).flat()

const pct = (n, d) => d ? `${Math.round(100 * n / d)}%`.padStart(4) : '  - '
console.log('modèle                   cas OK  prod OK  régr.  pronoms  étranger collé  erreurs  latence  tok in/out   $/1000 msg')
for (const m of models) {
	const r = all.filter(x => x.model === m)
	const ok = r.filter(x => !x.error)
	const regr = r.filter(x => REGRESSION_CASES.some(c => c.name === x.case))
	const pron = r.filter(x => PRONOUN_CASES.some(c => c.name === x.case))
	const avg = k => ok.length ? Math.round(ok.reduce((s, x) => s + x[k], 0) / ok.length) : 0
	const price = PRICES[m]
	const cost = price ? `$${((avg('tin') * price[0] + avg('tout') * price[1]) / 1000).toFixed(2)}` : '?'
	console.log([
		m.padEnd(24),
		pct(r.filter(x => x.caseOk).length, r.length).padStart(6),
		pct(r.filter(x => x.guardsOk).length, r.length).padStart(8),
		`${regr.filter(x => x.caseOk).length}/${regr.length}`.padStart(6),
		`${pron.filter(x => x.caseOk).length}/${pron.length}`.padStart(8),
		String(ok.filter(x => x.flags.foreign).length).padStart(9),
		String(ok.filter(x => x.flags.glued).length).padStart(6),
		String(r.filter(x => x.error).length).padStart(8),
		`${avg('ms')} ms`.padStart(9),
		`${avg('tin')}/${avg('tout')}`.padStart(12),
		cost.padStart(11),
	].join(' '))
}

const fails = all.filter(x => !x.caseOk || !x.guardsOk)
if (fails.length) {
	console.log(`\nÉchecs (${fails.length}) :`)
	for (const f of fails) {
		const why = f.error ?? [!f.caseOk && 'cas', ...Object.entries(f.flags ?? {}).filter(([, v]) => v).map(([k]) => k)].filter(Boolean).join('+')
		console.log(`  ${f.model.padEnd(22)} ${f.case.slice(0, 55).padEnd(55)} #${f.run} [${why}]${f.kh ? `\n      kh: ${f.kh}` : ''}${f.en && !f.caseOk ? `\n      en: ${f.en}` : ''}`)
	}
}
if (out) { writeFileSync(out, JSON.stringify(all, null, 2)); console.log(`\nRapport complet : ${out}`) }
