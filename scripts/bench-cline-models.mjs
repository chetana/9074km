#!/usr/bin/env node --experimental-strip-types
/**
 * Banc des modèles ClinePass pour la traduction du couple (choix du modèle principal / secours).
 * Même requête que chatCline (src/lib/server/glm.ts : temperature 0.2, max_tokens 4096, stream:false,
 * reasoning_effort bas), même prompt système que la prod (buildTranslateSystem + GLM_ADAPT), mêmes cas
 * et garde-fous que eval-translate.mjs. Mesure : cas OK, escalades (garde-fous => bascule Gemini),
 * latence médiane/p95, tokens in/out/raisonnement, coût de référence, erreurs HTTP.
 *
 * Réflexion minimale : pour chaque modèle on essaie reasoning_effort 'none' puis 'minimal' puis 'low'
 * puis rien ; le premier accepté par l'API est retenu et noté. Un modèle qui renvoie quand même des
 * tokens de raisonnement est signalé « réflexion présente (non désactivable) ».
 * Réactivité : après le 1er run, un modèle avec médiane > 6 s ou p95 > 10 s n'est pas relancé.
 *
 * Usage : CLINE_API_KEY=… node --experimental-strip-types scripts/bench-cline-models.mjs [--runs 2] [--only "texte"] [--out f.json] slug1 slug2 …
 * Consomme du quota ClinePass (jamais en CI). Ne logge jamais la clé.
 */
import { writeFileSync } from 'fs'
import {
	buildTranslateSystem, buildTranslateUser, cleanKhmer, GLM_ADAPT, detectIsChet,
	containsForeignScript, containsGluedLatin, glossaryEchoed, numbersPreserved, tendernessAdded, pronounSwapped, termsEchoed,
} from '../src/lib/server/khmer-guards.ts'
import { REGRESSION_CASES, PRONOUN_CASES, SHOP_CASES } from './translate-cases.mjs'

const KEY = process.env.CLINE_API_KEY
if (!KEY) { console.error('CLINE_API_KEY manquant'); process.exit(1) }
const args = process.argv.slice(2)
const take = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args.splice(i, 2)[1] : undefined }
const RUNS = Number(take('--runs') ?? 1)
const ONLY = take('--only')
const OUT = take('--out')
const MODELS = args
const CASES = [...REGRESSION_CASES, ...PRONOUN_CASES, ...SHOP_CASES].filter(c => !ONLY || c.name.toLowerCase().includes(ONLY.toLowerCase()))

// $/M tokens entrée/sortie (référence ; le forfait réel est fixe)
const PRICE = {
	'glm-5.3-flash': [0.15, 0.5], 'glm-5.3': [1.4, 4.4], 'kimi-k3': [3, 15], 'deepseek-v4.1-flash': [0.3, 1.2],
	'deepseek-v4-pro': [1.32, 3.96], 'minimax-m3': [0.3, 1.2], 'mimo-v2.5': [0.14, 0.28], 'mimo-v2.5-pro': [1.74, 3.48],
	'qwen3.7-plus': [0.4, 1.6], 'qwen3.8-max': [2, 6], 'qwen3.7-max': [2.5, 7.5], 'muse-spark-1.3-contributor': [0.1, 0.2],
}
const EFFORTS = ['none', 'minimal', 'low', null]
const effortOf = {} // slug -> niveau retenu (1er accepté)
const notes = {}    // slug -> notes (refus, format…)
const note = (m, s) => { (notes[m] ??= new Set()).add(s) }
let calls = 0

let n429 = 0
async function post(model, system, user, effort) {
	for (let k = 0; k < 8; k++) {
		const t1 = Date.now()
		const r = await post1(model, system, user, effort)
		r.ms = Date.now() - t1
		if (r.status !== 429) return r
		n429++; await new Promise(res => setTimeout(res, 3000 * (k + 1)))
	}
	return { status: 429, d: { error: '429 persistant' } }
}
async function post1(model, system, user, effort) {
	const body = { model: `cline-pass/${model}`, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], temperature: 0.2, max_tokens: 4096, stream: false }
	if (effort) body.reasoning_effort = effort
	calls++
	let r
	try {
		r = await fetch('https://api.cline.bot/api/v1/chat/completions', {
			method: 'POST', signal: AbortSignal.timeout(90000),
			headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', 'X-Title': 'lys-bench' },
			body: JSON.stringify(body),
		})
	} catch (e) { return { status: 0, d: { error: { message: String(e).slice(0, 80) } } } }
	return { status: r.status, ok: r.ok, d: await r.json().catch(() => ({})) }
}

async function call(model, system, user) {
	const ladder = model in effortOf ? [effortOf[model]] : EFFORTS
	for (const effort of ladder) {
		const r = await post(model, system, user, effort)
		if (r.ok) {
			if (!(model in effortOf)) { effortOf[model] = effort; note(model, `reasoning_effort=${effort ?? 'omis'}`) }
			const d = r.d?.data?.choices ? r.d.data : r.d // l'API Cline peut encapsuler { data: {...} }
			const ch = d?.choices?.[0]
			const u = d?.usage ?? {}
			return {
				raw: (ch?.message?.content ?? '').replace(/```json\n?/g, '').replace(/```\n?/g, '').trim(), ms: r.ms,
				tin: u.prompt_tokens ?? 0, tout: u.completion_tokens ?? 0,
				treason: u.completion_tokens_details?.reasoning_tokens ?? (ch?.message?.reasoning ? -1 : 0), finish: ch?.finish_reason,
			}
		}
		const full = JSON.stringify(r.d?.error ?? r.d), msg = full.slice(0, 100)
		if ((r.status === 400 || (r.status === 500 && /status 400|cannot be disabled|reasoning|effort/i.test(full))) && !(model in effortOf)) { note(model, `effort ${effort ?? 'omis'} refusé (${r.status})`); continue }
		return { err: `${r.status} ${msg}`, ms: r.ms }
	}
	return { err: '400 tous niveaux refusés', ms: 0 }
}

const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0 }

async function runOnce(model, st, records) {
	const lat = []
	// 2 appels en parallèle max par modèle (latence mesurée par appel, pas par lot)
	const queue = [...CASES]
	const worker = async () => {
		for (let c; (c = queue.shift());) {
			const res = await call(model, `${buildTranslateSystem(c.author)}\n\n${GLM_ADAPT}`, buildTranslateUser(c.text, c.context))
			st.total++; lat.push(res.ms)
			const rec = { model, case: c.name, ms: res.ms }
			records.push(rec)
			if (res.err) { st.err++; rec.err = res.err; st.fails.push({ c: c.name, why: res.err }); continue }
			st.tin += res.tin; st.tout += res.tout; if (res.treason > 0) st.reason += res.treason; if (res.treason < 0) st.reasonSeen = true
			let t
			try { t = JSON.parse(res.raw) } catch { st.err++; rec.err = 'JSON illisible'; st.fails.push({ c: c.name, why: `JSON illisible (${res.finish}) ${res.raw.slice(0, 60)}` }); continue }
			const kh = cleanKhmer(t.kh ?? ''), fr = t.fr ?? '', en = t.en ?? ''
			const isChet = detectIsChet(c.author)
			const good = c.check(kh, c.text) && (c.checkFrEn ? c.checkFrEn(fr, en) : true)
			const reason = containsForeignScript(kh) ? 'script' : containsGluedLatin(kh) ? 'latin' : !glossaryEchoed(c.text, { kh, fr, en }, isChet) ? 'glossaire'
				: !numbersPreserved(c.text, kh) ? 'nombres' : tendernessAdded(c.text, { kh, fr, en }) ? 'tendresse' : pronounSwapped(c.text, kh, isChet) ? 'pronom'
				: !termsEchoed({ kh, terms: (Array.isArray(t.terms) ? t.terms : []).filter(x => typeof x?.src === 'string' && typeof x?.kh === 'string') }, c.text) ? 'terms' : null
			rec.good = good; rec.reason = reason
			if (good) st.ok++; else st.fails.push({ c: c.name, why: `kh=${kh.slice(0, 50)} | fr=${fr.slice(0, 70)} | en=${en.slice(0, 70)}` })
			if (reason) { st.esc++; st.escReasons[reason] = (st.escReasons[reason] ?? 0) + 1 }
		}
	}
	await Promise.all(Array.from({ length: 2 }, worker))
	st.lat.push(...lat)
}

async function bench(model, records) {
	const st = { model, ok: 0, total: 0, esc: 0, err: 0, tin: 0, tout: 0, reason: 0, reasonSeen: false, fails: [], lat: [], escReasons: {}, runs: 0, skipped: '' }
	await call(model, 'Réponds en JSON {"ok":true}', 'test') // sonde : fixe le niveau de réflexion accepté avant les appels parallèles
	for (let i = 0; i < RUNS; i++) {
		await runOnce(model, st, records); st.runs++
		const med = pct(st.lat, 0.5), p95 = pct(st.lat, 0.95)
		if (i < RUNS - 1 && (med > 6000 || p95 > 10000)) { st.skipped = `1 run seulement (latence médiane ${med} ms / p95 ${p95} ms)`; break }
	}
	return st
}

const records = []
const results = []
for (const m of MODELS) results.push(await bench(m, records)) // séquentiel : l'API Cline renvoie 429 si on parallélise 8 modèles
console.log(`429 rencontrés (retentés) : ${n429}`)
const price = (m) => PRICE[m] ?? [0, 0]
const rows = results.map(r => {
	const [pi, po] = price(r.model), n = r.total - r.err
	return { ...r, med: pct(r.lat, 0.5), p95: pct(r.lat, 0.95), usd: n ? (r.tin * pi + r.tout * po) / 1e6 / n : 0, tinM: n ? Math.round(r.tin / n) : 0, toutM: n ? Math.round(r.tout / n) : 0, reasonM: n ? Math.round(r.reason / n) : 0 }
})
console.log(`\nAppels API : ${calls} ; cas par run : ${CASES.length}`)
console.log('Modèle'.padEnd(22), 'OK%'.padEnd(12), 'escal%'.padEnd(10), 'err'.padEnd(5), 'méd ms'.padEnd(8), 'p95 ms'.padEnd(8), 'in/out/raison'.padEnd(16), '$/msg', ' effort')
for (const r of rows.sort((a, b) => b.ok / b.total - a.ok / a.total)) {
	console.log(r.model.padEnd(22), `${(100 * r.ok / r.total).toFixed(0)}% (${r.ok}/${r.total})`.padEnd(12), `${(100 * r.esc / r.total).toFixed(0)}%`.padEnd(10), String(r.err).padEnd(5),
		String(r.med).padEnd(8), String(r.p95).padEnd(8), `${r.tinM}/${r.toutM}/${r.reasonM}`.padEnd(16), r.usd.toFixed(6), ' ', [...(notes[r.model] ?? [])].join('; '),
		r.reason > 0 || r.reasonSeen ? ' ⚠ réflexion présente (non désactivable)' : '', r.skipped ? ` [${r.skipped}]` : '')
}
console.log(`Coût de référence total du banc : $${rows.reduce((s, r) => s + r.usd * (r.total - r.err), 0).toFixed(4)}`)
for (const r of rows) if (r.fails.length) console.log(`\n${r.model} — échecs (${r.fails.length}) :\n  ${r.fails.slice(0, 8).map(f => `${f.c.slice(0, 45)} → ${f.why}`).join('\n  ')}`)
if (OUT) writeFileSync(OUT, JSON.stringify({ calls, rows: rows.map(({ lat, ...x }) => x), notes: Object.fromEntries(Object.entries(notes).map(([k, v]) => [k, [...v]])), records }, null, 1))
