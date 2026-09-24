#!/usr/bin/env node --experimental-strip-types
/**
 * Éval manuelle du pipeline de traduction — remplace ab-engine-bench.mjs / glm-khmer-protocol.mjs
 * / glm-prompt-v2.mjs, qui contenaient chacun une COPIE-COLLÉE du prompt de prod (coupleContext /
 * buildTranslateSystem) à une date différente, silencieusement désynchronisée à chaque fix de
 * traduction (ex : glm-prompt-v2.mjs n'avait ni le glossaire "il faut que"/"mes parents" ni la
 * règle anti-hallucination sémantique du 22/09). Ce script importe DIRECTEMENT
 * buildTranslateSystem/buildTranslateUser depuis src/lib/server/khmer-guards.ts : il teste
 * toujours le prompt réel, jamais une copie.
 *
 * Usage :
 *   node --experimental-strip-types scripts/eval-translate.mjs           # cas de régression connus
 *   node --experimental-strip-types scripts/eval-translate.mjs --replay 20   # + N derniers messages réels d'aujourd'hui (jugement humain)
 *   node --experimental-strip-types scripts/eval-translate.mjs --replay 200 --date 2026-09-22   # idem, un autre jour
 *   node --experimental-strip-types scripts/eval-translate.mjs --runs 6 --only "24/09 soir"   # 6 essais par cas, filtrés par nom
 *
 * Lecture seule : aucune écriture, ni en base ni sur S3. À lancer à la main avant tout changement
 * de prompt/modèle dans vertex.ts/glm.ts — jamais en CI (coûte de vrais appels GLM/Gemini).
 */
import { readFileSync } from 'fs'
import { execSync } from 'child_process'
import {
	buildTranslateSystem, buildTranslateUser, cleanKhmer, GLM_ADAPT, detectIsChet,
	containsForeignScript, containsGluedLatin, glossaryEchoed, numbersPreserved, tendernessAdded, pronounSwapped,
} from '../src/lib/server/khmer-guards.ts'

// Prompt système EXACT de la prod pour GLM : vertex.ts appelle chatGo(`${system}\n\n${GLM_ADAPT}`, …).
const glmSystem = (author) => `${buildTranslateSystem(author)}\n\n${GLM_ADAPT}`
import { REGRESSION_CASES, PRONOUN_CASES } from './translate-cases.mjs'

const CASES = [...REGRESSION_CASES, ...PRONOUN_CASES]

const ENV = Object.fromEntries(
	readFileSync(new URL('../.env', import.meta.url), 'utf8')
		.split('\n').filter(l => l.includes('=') && !l.startsWith('#')).map(l => {
			const i = l.indexOf('=')
			return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
		})
)

// ── GLM (OpenCode Go) — moteur principal en prod ──
async function callGlm(system, user) {
	const r = await fetch('https://opencode.ai/zen/go/v1/chat/completions', {
		method: 'POST',
		headers: { Authorization: `Bearer ${ENV.OPENCODE_API_KEY}`, 'Content-Type': 'application/json', 'x-opencode-session': 'lys-eval-translate' },
		body: JSON.stringify({
			model: 'glm-5.3-flash',
			messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
			temperature: 0.2, max_tokens: 2048, reasoning_effort: 'low',
		}),
	})
	const d = await r.json()
	if (!r.ok) return `[ERR ${r.status} ${JSON.stringify(d).slice(0, 120)}]`
	return (d?.choices?.[0]?.message?.content ?? '').replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
}

function parseKh(raw) {
	try { return JSON.parse(raw).kh ?? '' } catch { return raw }
}

function parseAll(raw) {
	try { const t = JSON.parse(raw); return { fr: t.fr ?? '', en: t.en ?? '' } } catch { return { fr: '', en: '' } }
}

async function runRegressionCases(runs, only) {
	const cases = only ? CASES.filter(c => c.name.toLowerCase().includes(only.toLowerCase())) : CASES
	console.log(`\n${'═'.repeat(78)}\nCAS DE RÉGRESSION + PROTOCOLE PRONOMS (${cases.length} cas × ${runs} essai${runs > 1 ? 's' : ''})\n${'═'.repeat(78)}`)
	let failures = 0
	let escalations = 0, total = 0
	const why = {}
	for (const c of cases) {
		const system = glmSystem(c.author)
		const user = buildTranslateUser(c.text, c.context)
		let passed = 0
		const samples = []
		for (let run = 0; run < runs; run++) {
			const raw = await callGlm(system, user)
			const kh = cleanKhmer(parseKh(raw))
			const { fr, en } = parseAll(raw)
			const ok = c.check(kh, c.text) && (c.checkFrEn ? c.checkFrEn(fr, en) : true)
			// Mêmes garde-fous que translateWithEscalation : une sortie rejetée ici part vers Gemini en prod.
			const t = { kh, fr, en }
			const reason = containsForeignScript(kh) ? 'foreign_script' : containsGluedLatin(kh) ? 'glued_latin'
				: !glossaryEchoed(c.text, t, detectIsChet(c.author)) ? 'glossary_miss' : !numbersPreserved(c.text, kh) ? 'number_drift'
				: tendernessAdded(c.text, t) ? 'tenderness_added'
				: pronounSwapped(c.text, kh, detectIsChet(c.author)) ? 'pronoun_swapped' : null
			total++
			if (reason) { escalations++; why[reason] = (why[reason] ?? 0) + 1; console.log(`   ⤴ escalade [${reason}] ${c.name.slice(0, 45)} → ${kh}`) }
			if (ok) passed++
			else failures++
			// Un seul essai : on montre tout. Plusieurs : seulement les échecs (et la 1re sortie en exemple).
			if (runs === 1 || !ok || run === 0) samples.push({ ok, kh: kh || raw, fr, en })
		}
		console.log(`${passed === runs ? '✅' : '❌'} ${runs > 1 ? `${passed}/${runs} ` : ''}${c.name}`)
		console.log(`   [${c.author}] ${c.text}`)
		for (const smp of samples) {
			console.log(`   ${runs > 1 ? (smp.ok ? 'ok ' : 'KO ') : ''}→ kh: ${smp.kh}`)
			if (c.checkFrEn || !smp.ok) console.log(`        fr: ${smp.fr}\n        en: ${smp.en}`)
		}
	}
	console.log(`\nEscalades vers Gemini que la prod aurait déclenchées : ${escalations}/${total}${escalations ? ` (${JSON.stringify(why)})` : ''}`)
	console.log(`${failures === 0 ? '✅ Tous les cas de régression passent.' : `❌ ${failures} échec(s) — lire le prompt/glossaire avant de merger.`}`)
	return failures
}

// ── replay de vrais messages du bucket (jugement humain, pas de verdict automatique) ──
async function replayReal(n, dateArg) {
	const day = dateArg ?? new Date().toISOString().slice(0, 10)
	const path = day.replace(/-/g, '/')
	console.log(`\n${'═'.repeat(78)}\nREPLAY DES ${n} DERNIERS MESSAGES RÉELS (${day}) — jugement humain\n${'═'.repeat(78)}`)
	let out
	try {
		out = execSync(
			`aws s3 cp s3://chet-lys-coffre/chat/${path}.json - --endpoint-url ${ENV.S3_ENDPOINT ?? 'https://s3.fr-par.scw.cloud'}`,
			{ env: { ...process.env, AWS_ACCESS_KEY_ID: ENV.S3_ACCESS_KEY, AWS_SECRET_ACCESS_KEY: ENV.S3_SECRET_KEY }, stdio: ['ignore', 'pipe', 'ignore'] }
		).toString()
	} catch {
		console.log(`(aucun message le ${day} — relance avec un autre jour si besoin)`)
		return
	}
	const normAuthor = (a) => (a?.normalize('NFD').replace(/[̀-ͯ]/g, '') ?? '').toLowerCase()
	const messages = JSON.parse(out)
		.filter(m => (m.text ?? '').trim().length > 5)
		.map(m => ({ author: normAuthor(m.author).match(/^(chetana|chet)$/) ? 'Chet' : 'Lys', text: (m.text ?? '').trim(), prodKh: m.kh ?? '', prodFr: m.fr ?? '', prodEn: m.en ?? '' }))
		.slice(-n)

	let leaks = 0
	for (const [i, m] of messages.entries()) {
		const system = glmSystem(m.author)
		const user = buildTranslateUser(m.text)
		const raw = await callGlm(system, user)
		const kh = cleanKhmer(parseKh(raw))
		const { fr, en } = parseAll(raw)
		const leak = /\bbang\b/i.test(fr) || /\bbang\b/i.test(en) || /\boun\b/i.test(fr) || /\boun\b/i.test(en)
		if (leak) leaks++
		console.log(`\n${i + 1}. [${m.author}] ${m.text}`)
		console.log(`   prod kh : ${m.prodKh}`)
		console.log(`   éval kh : ${kh}${kh === m.prodKh ? '  (identique)' : ''}`)
		console.log(`   éval fr : ${fr}${leak ? '  ⚠️ FUITE bang/oun' : ''}`)
		console.log(`   éval en : ${en}${leak ? '  ⚠️ FUITE bang/oun' : ''}`)
	}
	console.log(`\n${leaks === 0 ? `✅ Aucune fuite "bang"/"oun" littérale sur ${messages.length} messages.` : `❌ ${leaks} fuite(s) "bang"/"oun" détectée(s) sur ${messages.length} messages.`}`)
}

const argVal = (name, dflt) => { const i = process.argv.indexOf(name); return i === -1 ? dflt : process.argv[i + 1] }
const replayArgIndex = process.argv.indexOf('--replay')
const dateArgIndex = process.argv.indexOf('--date')
const failures = await runRegressionCases(parseInt(argVal('--runs', '1'), 10), argVal('--only', null))
if (replayArgIndex !== -1) {
	const n = parseInt(process.argv[replayArgIndex + 1] || '20', 10)
	const dateArg = dateArgIndex !== -1 ? process.argv[dateArgIndex + 1] : undefined
	await replayReal(n, dateArg)
}
process.exit(failures === 0 ? 0 : 1)
