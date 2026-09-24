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
	glossaryEchoed, numbersPreserved,
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
	{
		// Bug réel du 24/09/2026 : sur 6 essais, le khmer halluciné un mot bidon pour "ma chérie"
		// collée à "Bonjour" à 5/6, ET l'heure glissait (8h/11h au lieu de 22h/10h) à 2/6 — jamais
		// en fr/en dans la même génération. glossaryEchoed + numbersPreserved lisent la source
		// directement, pas besoin que le modèle annonce quoi que ce soit dans `terms[]`.
		name: '"Bonjour ma chérie" + heure (bug réel : khmer halluciné + heure qui glisse)', author: 'Chet',
		text: "Bonjour ma chérie 😘, je suis rentré vers 22h, la je pars au travail, je suis dans le train 🚝",
		check: (kh, text) => glossaryEchoed(text, { kh, fr: '', en: '' }, true) && numbersPreserved(text, kh),
	},
	{
		// Bug réel du 24/09/2026 : "ប្ដីសម្លាញ់" (mari affectueux) rendu en français perd "mari" sur
		// 2-3/6 essais (reste juste "chéri"), ou tournure bancale "mon chéri de mari" sur 2/6.
		name: 'ប្ដីសម្លាញ់ → "mari" ne doit pas disparaître du fr/en (bug réel)', author: 'Lys',
		text: "ញាំទឹកអោយបានច្រើនផងណាប្ដីសម្លាញ់",
		check: () => true,
		checkFrEn: (fr, en) => /\bmari\b/i.test(fr) && /\bhusband\b/i.test(en),
	},
	{
		// Bug réel du 24/09/2026 : "se remettre à un sport" glisse souvent vers un cadrage "dois
		// trouver un moyen/une possibilité de..." (រក) absent de la source, sur 5/6 essais — pas de
		// garde de forme fiable possible ici (រក est un mot légitime ailleurs), affiché pour lecture
		// humaine au --replay ou relance manuelle, pas de check automatisable.
		name: '"se remettre à un sport" — cadrage រក (chercher) parasite, à relire à l\'œil', author: 'Chet',
		text: "Il faut que j'arrive à me remettre à un sport mais je suis toujours fatigué je ne comprends pas",
		check: () => true,
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
		const ok = c.check(kh, c.text) && (c.checkFrEn ? c.checkFrEn(fr, en) : true)
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
		const system = buildTranslateSystem(m.author)
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

const replayArgIndex = process.argv.indexOf('--replay')
const dateArgIndex = process.argv.indexOf('--date')
const failures = await runRegressionCases()
if (replayArgIndex !== -1) {
	const n = parseInt(process.argv[replayArgIndex + 1] || '20', 10)
	const dateArg = dateArgIndex !== -1 ? process.argv[dateArgIndex + 1] : undefined
	await replayReal(n, dateArg)
}
process.exit(failures === 0 ? 0 : 1)
