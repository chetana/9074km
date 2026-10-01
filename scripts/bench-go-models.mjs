#!/usr/bin/env node --experimental-strip-types
/**
 * Banc des modèles de l'abonnement OpenCode Go pour la traduction du couple — sert à choisir le
 * modèle de SECOURS de GLM-5.3-flash (avant Gemini). Même prompt système que la prod, mêmes cas et
 * mêmes garde-fous que eval-translate.mjs. Un modèle qui échoue souvent aux cas de régression ou
 * déclenche beaucoup d'escalades n'est pas un bon secours : il ferait escalader vers Gemini quand même.
 *
 * Usage : node --experimental-strip-types scripts/bench-go-models.mjs [--runs 2] model1 model2 ...
 * Lecture seule ; consomme du quota OpenCode Go (jamais en CI).
 */
import { readFileSync } from 'fs'
import {
	buildTranslateSystem, buildTranslateUser, cleanKhmer, GLM_ADAPT, detectIsChet,
	containsForeignScript, containsGluedLatin, glossaryEchoed, numbersPreserved, tendernessAdded, pronounSwapped, termsEchoed,
} from '../src/lib/server/khmer-guards.ts'
import { REGRESSION_CASES, PRONOUN_CASES } from './translate-cases.mjs'

const ENV = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')
	.filter(l => l.includes('=') && !l.startsWith('#')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const args = process.argv.slice(2)
const runsIdx = args.indexOf('--runs')
const RUNS = runsIdx >= 0 ? Number(args.splice(runsIdx, 2)[1]) : 1
const MODELS = args
const CASES = [...REGRESSION_CASES, ...PRONOUN_CASES]

async function call(model, system, user) {
	const t0 = Date.now()
	for (const withEffort of [true, false]) {
		const body = { model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], temperature: 0.2, max_tokens: 4096 }
		if (withEffort) body.reasoning_effort = 'low'
		const r = await fetch('https://opencode.ai/zen/go/v1/chat/completions', {
			method: 'POST', signal: AbortSignal.timeout(90000),
			headers: { Authorization: `Bearer ${ENV.OPENCODE_API_KEY}`, 'Content-Type': 'application/json', 'x-opencode-session': `lys-bench-${model}`, 'User-Agent': 'lys-bench/1.0' },
			body: JSON.stringify(body),
		}).catch(e => ({ ok: false, status: 0, json: async () => ({ error: { message: String(e) } }) }))
		const d = await r.json().catch(() => ({}))
		if (r.ok) return { raw: (d?.choices?.[0]?.message?.content ?? '').replace(/```json\n?/g, '').replace(/```\n?/g, '').trim(), ms: Date.now() - t0 }
		if (!(r.status === 400 && withEffort)) return { err: `${r.status} ${JSON.stringify(d?.error ?? d).slice(0, 80)}`, ms: Date.now() - t0 }
	}
}

async function bench(model) {
	let ok = 0, esc = 0, err = 0, total = 0, ms = 0
	const fails = []
	for (const c of CASES) {
		for (let i = 0; i < RUNS; i++) {
			total++
			const res = await call(model, `${buildTranslateSystem(c.author)}\n\n${GLM_ADAPT}`, buildTranslateUser(c.text, c.context))
			ms += res.ms
			if (res.err) { err++; fails.push(`${c.name.slice(0, 30)} → ${res.err}`); continue }
			let t
			try { t = JSON.parse(res.raw) } catch { err++; fails.push(`${c.name.slice(0, 30)} → JSON illisible`); continue }
			const kh = cleanKhmer(t.kh ?? ''), fr = t.fr ?? '', en = t.en ?? ''
			const isChet = detectIsChet(c.author)
			const good = c.check(kh, c.text) && (c.checkFrEn ? c.checkFrEn(fr, en) : true)
			const reason = containsForeignScript(kh) ? 'script' : containsGluedLatin(kh) ? 'latin' : !glossaryEchoed(c.text, { kh, fr, en }, isChet) ? 'glossaire'
				: !numbersPreserved(c.text, kh) ? 'nombres' : tendernessAdded(c.text, { kh, fr, en }) ? 'tendresse' : pronounSwapped(c.text, kh, isChet) ? 'pronom'
				: !termsEchoed({ kh, terms: (Array.isArray(t.terms) ? t.terms : []).filter(x => typeof x?.src === 'string' && typeof x?.kh === 'string') }, c.text) ? 'terms' : null
			if (good) ok++; else fails.push(`${c.name.slice(0, 40)} → ${kh.slice(0, 40)}`)
			if (reason) esc++
		}
	}
	return { model, ok, total, esc, err, avgS: (ms / total / 1000).toFixed(1), fails }
}

const results = await Promise.all(MODELS.map(bench))
console.log(`\nModèle`.padEnd(26), 'cas OK'.padEnd(10), 'escalades'.padEnd(11), 'erreurs'.padEnd(9), 'latence moy.')
for (const r of results.sort((a, b) => b.ok - a.ok)) {
	console.log(r.model.padEnd(25), `${r.ok}/${r.total}`.padEnd(10), `${r.esc}/${r.total}`.padEnd(11), String(r.err).padEnd(9), `${r.avgS}s`)
}
for (const r of results) if (r.fails.length) console.log(`\n${r.model} — échecs :\n  ${r.fails.slice(0, 6).join('\n  ')}`)
