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
 *   node --experimental-strip-types scripts/eval-translate.mjs --replay 20   # + N derniers messages réels (jugement humain)
 *
 * Lecture seule : aucune écriture, ni en base ni sur S3. À lancer à la main avant tout changement
 * de prompt/modèle dans vertex.ts/glm.ts — jamais en CI (coûte de vrais appels GLM/Gemini).
 */
import { readFileSync } from 'fs'
import { execSync } from 'child_process'
import { createSign } from 'crypto'
import {
	buildTranslateSystem, buildTranslateUser,
	containsForeignScript, containsGluedLatin, cleanKhmer,
} from '../src/lib/server/khmer-guards.ts'

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

// ── cas de régression connus (bugs réels trouvés le 22/09/2026, cf. CLAUDE.md / historique git) ──
// Chaque cas vérifie une invariance observable dans le khmer produit — pas un jugement subjectif
// de qualité (ça, c'est le rôle du --replay, lu par un humain).
const REGRESSION_CASES = [
	{
		name: 'allergie (glossaire)', author: 'Chet', text: "Attention elle est allergique au sésame",
		check: (kh) => kh.includes('អាលែកហ្ស៊ី') && kh.includes('ល្ង'),
	},
	{
		name: 'acidulé/aigre (glossaire)', author: 'Lys', text: "C'est trop acidulé pour moi",
		check: (kh) => kh.includes('ជូរ'),
	},
	{
		name: 'bleu (glossaire)', author: 'Chet', text: "J'ai acheté une robe bleue pour toi",
		check: (kh) => kh.includes('ខៀវ'),
	},
	{
		name: '"il faut que" ≠ perdre (bug réel : traduit à tort en បាត់បង់)', author: 'Chet',
		text: "Il faut que tu manges avant d'aller travailler",
		check: (kh) => (kh.includes('ត្រូវ')) && !kh.includes('បាត់បង់'),
	},
	{
		name: '"mes parents" registre intime (bug réel : traduit trop formel en មាតាបិតា)', author: 'Lys',
		text: "Mes parents demandent de tes nouvelles",
		check: (kh) => kh.includes('ប៉ាម៉ាក់') && !kh.includes('មាតាបិតា'),
	},
	{
		name: 'inversion de sens cher/pas cher (bug réel)', author: 'Chet',
		text: "Ce restaurant n'est pas cher du tout",
		// on ne peut pas connaître LE mot exact que le modèle choisira pour "pas cher", donc on
		// vérifie juste l'absence de corruption — cette phrase sert surtout de garde-fou lu par un
		// humain (voir README), le vrai check automatisable est glued-latin/foreign-script ci-dessous.
		check: (kh) => !containsForeignScript(kh) && !containsGluedLatin(kh),
	},
	{
		name: 'pas de script étranger ni de latin collé (corruption)', author: 'Lys',
		text: "Tu as vu les boutons de ma nouvelle veste ?",
		check: (kh) => !containsForeignScript(kh) && !containsGluedLatin(kh),
	},
	{
		// Bug réel du 23/09/2026 : "បង" utilisé en interpellation (fin de phrase, pas sujet/objet
		// d'un verbe) transcrit tel quel ("bang") dans le fr/en au lieu de "chéri(e)"/"darling".
		name: '"បង" en interpellation → chéri/darling (bug réel, pas Oun/Bang littéral)', author: 'Lys',
		text: "មើលទៅហួយម៉ែនទែបង បងពូកែធ្វើងាស់ អរគុណណាស់ដែរ",
		check: () => true, // le vrai check est sur fr/en, voir checkFrEn
		checkFrEn: (fr, en) => !/\bbang\b/i.test(fr) && !/\bbang\b/i.test(en),
	},
]

async function runRegressionCases() {
	console.log(`\n${'═'.repeat(78)}\nCAS DE RÉGRESSION CONNUS (${REGRESSION_CASES.length})\n${'═'.repeat(78)}`)
	let failures = 0
	for (const c of REGRESSION_CASES) {
		const system = buildTranslateSystem(c.author)
		const user = buildTranslateUser(c.text)
		const raw = await callGlm(system, user)
		const kh = cleanKhmer(parseKh(raw))
		const { fr, en } = parseAll(raw)
		const ok = c.check(kh) && (c.checkFrEn ? c.checkFrEn(fr, en) : true)
		if (!ok) failures++
		console.log(`${ok ? '✅' : '❌'} ${c.name}`)
		console.log(`   [${c.author}] ${c.text}`)
		console.log(`   → kh: ${kh || raw}`)
		if (c.checkFrEn) console.log(`   → fr: ${fr}\n   → en: ${en}`)
	}
	console.log(`\n${failures === 0 ? '✅ Tous les cas de régression passent.' : `❌ ${failures} cas en échec — lire le prompt/glossaire avant de merger.`}`)
	return failures
}

// ── replay de vrais messages du bucket (jugement humain, pas de verdict automatique) ──
async function replayReal(n) {
	const today = new Date().toISOString().slice(0, 10).replace(/-/g, '/')
	console.log(`\n${'═'.repeat(78)}\nREPLAY DES ${n} DERNIERS MESSAGES RÉELS (${today}) — jugement humain\n${'═'.repeat(78)}`)
	let out
	try {
		out = execSync(
			`aws s3 cp s3://chet-lys-coffre/chat/${today}.json - --endpoint-url ${ENV.S3_ENDPOINT ?? 'https://s3.fr-par.scw.cloud'}`,
			{ env: { ...process.env, AWS_ACCESS_KEY_ID: ENV.S3_ACCESS_KEY, AWS_SECRET_ACCESS_KEY: ENV.S3_SECRET_KEY }, stdio: ['ignore', 'pipe', 'ignore'] }
		).toString()
	} catch {
		console.log("(aucun message aujourd'hui — relance avec un autre jour si besoin)")
		return
	}
	const normAuthor = (a) => (a?.normalize('NFD').replace(/[̀-ͯ]/g, '') ?? '').toLowerCase()
	const messages = JSON.parse(out)
		.filter(m => (m.text ?? '').trim().length > 5)
		.map(m => ({ author: normAuthor(m.author).match(/^(chetana|chet)$/) ? 'Chet' : 'Lys', text: (m.text ?? '').trim(), prodKh: m.kh ?? '' }))
		.slice(-n)

	for (const [i, m] of messages.entries()) {
		const system = buildTranslateSystem(m.author)
		const user = buildTranslateUser(m.text)
		const raw = await callGlm(system, user)
		const kh = cleanKhmer(parseKh(raw))
		console.log(`\n${i + 1}. [${m.author}] ${m.text}`)
		console.log(`   prod : ${m.prodKh}`)
		console.log(`   éval : ${kh}${kh === m.prodKh ? '  (identique)' : ''}`)
	}
}

const replayArgIndex = process.argv.indexOf('--replay')
const failures = await runRegressionCases()
if (replayArgIndex !== -1) {
	const n = parseInt(process.argv[replayArgIndex + 1] || '20', 10)
	await replayReal(n)
}
process.exit(failures === 0 ? 0 : 1)
