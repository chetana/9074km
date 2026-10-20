#!/usr/bin/env node
// @ts-nocheck
/**
 * Budget du bundle INITIAL du coffre : somme gzip des chunks JS/CSS que la route /coffre charge d'emblée (fermeture
 * statique du nœud /coffre, moins ce que le layout charge déjà ; les chunks dynamiques, comme le mode tri, n'y
 * comptent pas). Échoue au-delà de +15 % de la base de référence `scripts/bundle-budget.json`.
 *
 * Usage (après `npm run build`) :
 *   node scripts/bundle-budget.mjs            # mesure et compare
 *   node scripts/bundle-budget.mjs --update   # fixe la référence sur la mesure actuelle (à faire après une hausse voulue)
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const TOLERANCE = 0.15
const ROOT = new URL('..', import.meta.url).pathname
const CLIENT = join(ROOT, '.svelte-kit/output/client')
const BASELINE = join(ROOT, 'scripts/bundle-budget.json')

export function measureCoffreBundle(clientDir = CLIENT, appJs = join(ROOT, '.svelte-kit/generated/client-optimized/app.js')) {
	const manifest = JSON.parse(readFileSync(join(clientDir, '.vite/manifest.json'), 'utf8'))
	const app = readFileSync(appJs, 'utf8')
	const node = /"\/coffre": \[(\d+)\]/.exec(app)?.[1]
	if (node === undefined) throw new Error('route /coffre introuvable dans app.js')
	const entry = Object.keys(manifest).find((k) => k.endsWith(`nodes/${node}.js`))
	const layout = Object.keys(manifest).find((k) => k.endsWith('nodes/0.js'))
	if (!entry || !layout) throw new Error('nœuds introuvables dans le manifest')
	const closure = (k, seen = new Set()) => { if (seen.has(k)) return seen; seen.add(k); for (const i of manifest[k].imports ?? []) closure(i, seen); return seen }
	const own = [...closure(entry)].filter((k) => !closure(layout).has(k))
	let gzip = 0, raw = 0
	const files = []
	for (const k of own) {
		for (const f of [manifest[k].file, ...(manifest[k].css ?? [])]) {
			const b = readFileSync(join(clientDir, f))
			raw += b.length
			gzip += gzipSync(b).length
			files.push(f)
		}
	}
	return { gzip, raw, files }
}

export function verdict(measured, baseline, tolerance = TOLERANCE) {
	const limit = Math.round(baseline * (1 + tolerance))
	return { ok: measured <= limit, limit, ratio: measured / baseline }
}

function main() {
	if (!existsSync(join(CLIENT, '.vite/manifest.json'))) { console.error('Pas de build : lancez `npm run build` d\'abord.'); process.exit(2) }
	const m = measureCoffreBundle()
	if (process.argv.includes('--update')) {
		writeFileSync(BASELINE, JSON.stringify({ gzip: m.gzip, note: 'bundle initial /coffre (gzip) — référence du budget +15 %' }, null, 2) + '\n')
		console.log(`Référence mise à jour : ${m.gzip} octets gzip`)
		return
	}
	const base = JSON.parse(readFileSync(BASELINE, 'utf8')).gzip
	const v = verdict(m.gzip, base)
	console.log(`Bundle initial /coffre : ${m.gzip} octets gzip (référence ${base}, limite ${v.limit}, ${(v.ratio * 100 - 100).toFixed(1)} %)`)
	if (!v.ok) { console.error('BUDGET DÉPASSÉ (> +15 %)'); process.exit(1) }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
