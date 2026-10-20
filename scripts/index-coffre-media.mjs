#!/usr/bin/env node --experimental-strip-types
// @ts-nocheck
/**
 * Rétro-indexation des photos/vidéos DÉJÀ présentes dans S3 dans la table `media` (lot 2).
 *
 * Liste tout `YYYY/MM/DD/fichier` (pagination ContinuationToken), ignore meta.json / reactions.json /
 * note.txt / dotfiles / clés hors format / extensions inconnues, déduit day + kind du chemin, lit
 * `meta.json` du jour pour uploaded_by. `uploaded_at` = LastModified S3 (UTC, INFORMATIF : jamais une
 * date de prise de vue ; taken_at reste NULL). INSERT … ON CONFLICT (path) DO NOTHING : une ligne
 * existante (notamment avec EXIF, lot 1b) n'est jamais modifiée. Relançable : 2e passage = 0 insertion.
 *
 * Usage :
 *   node --experimental-strip-types scripts/index-coffre-media.mjs [--dry-run | --apply] [--limit N] [--year YYYY]
 *
 *   --dry-run  (défaut) n'écrit RIEN (connexion Postgres en lecture seule) : totaux par année/mois,
 *              photos/vidéos, nouvelles lignes, « à classer » (lignes sans évènement)
 *   --apply    écrit : crée la table `media` si besoin (002-media.sql, additif), insère par lots de 500.
 *              ATOMIQUE : tout `--apply` tient dans UNE transaction (savepoint par lot, un seul COMMIT) ;
 *              la moindre erreur annule tout. Exige --yes (ou CONFIRM=1) pour éviter un apply accidentel.
 *   --limit N  s'arrête après N fichiers retenus (les compteurs d'ignorés sont alors PARTIELS) ;  --year YYYY  limite à une année
 *   --yes      confirme l'écriture avec --apply (équivalent : variable d'environnement CONFIRM=1)
 *
 * Connexion : DATABASE_URL, GCS_BUCKET_NAME, S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY, S3_SECRET_KEY,
 * lus dans l'environnement puis, à défaut, dans .env à la racine. Aucune valeur n'est jamais affichée.
 */
import { readFileSync, existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3'
import pg from 'pg'
import { isValidCoffrePath, isMediaFile, isImageFile } from '../src/lib/server/coffre-path.ts'

const BATCH = 500
const VIDEO_EXT = /\.(mp4|mov|webm|avi|mkv|m4v|3gp)$/i

export function parseArgs(argv) {
	const o = { apply: false, dryRun: false, yes: false, limit: null, year: null, help: false }
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i]
		if (a === '--apply') o.apply = true
		else if (a === '--dry-run') o.dryRun = true
		else if (a === '--yes') o.yes = true
		else if (a === '--help' || a === '-h') o.help = true
		else if (a === '--limit') {
			const n = Number(argv[++i])
			if (!Number.isInteger(n) || n < 1) throw new Error('--limit attend un entier ≥ 1')
			o.limit = n
		} else if (a === '--year') {
			const y = argv[++i]
			if (!/^\d{4}$/.test(y ?? '')) throw new Error('--year attend AAAA')
			o.year = y
		} else throw new Error(`option inconnue : ${a}`)
	}
	if (o.apply && o.dryRun) throw new Error('--apply et --dry-run sont exclusifs')
	return o
}

function realDay(y, m, d) {
	const t = new Date(Date.UTC(+y, +m - 1, +d))
	return t.getUTCFullYear() === +y && t.getUTCMonth() === +m - 1 && t.getUTCDate() === +d
}

/** Clé S3 → { path, day, kind } si c'est une photo/vidéo du coffre à indexer, sinon { skip: raison }. */
export function classifyKey(key) {
	if (!isValidCoffrePath(key)) return { skip: 'hors format' }
	const [y, m, d, file] = key.split('/')
	if (file.startsWith('.')) return { skip: 'fichier caché' }
	if (!isMediaFile(key)) return { skip: 'méta' }
	if (!realDay(y, m, d)) return { skip: 'jour invalide' }
	const kind = isImageFile(key) ? 'image' : VIDEO_EXT.test(file) ? 'video' : null
	if (!kind) return { skip: 'extension inconnue' }
	return { path: key, day: `${y}-${m}-${d}`, kind }
}

/** Liste tous les objets sous `prefix`, page après page (ContinuationToken), jusqu'à IsTruncated=false. */
export async function listAllObjects(s3, bucket, prefix = '') {
	const out = []
	let token
	for (let page = 0; page < 100000; page++) {
		const r = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix || undefined, ContinuationToken: token }))
		out.push(...(r.Contents ?? []))
		if (!r.IsTruncated || !r.NextContinuationToken) break
		token = r.NextContinuationToken
	}
	return out
}

/**
 * Objets S3 → lignes à indexer + compte des clés ignorées par raison.
 * @param {any[]} objects
 * @param {{ limit?: number | null }} [opts]
 */
export function selectRows(objects, { limit = null } = {}) {
	const rows = []
	const skipped = {}
	for (const o of objects) {
		const c = classifyKey(o.Key)
		if (c.skip) { skipped[c.skip] = (skipped[c.skip] ?? 0) + 1; continue }
		if (limit !== null && rows.length >= limit) break
		rows.push({ ...c, size: Number(o.Size ?? 0), uploadedAt: o.LastModified ? new Date(o.LastModified).toISOString() : null, uploadedBy: null })
	}
	return { rows, skipped }
}

/** meta.json du jour : absent (404) = normal, vide ; illisible (réseau, 5xx, JSON cassé) = 1 nouvelle tentative puis comptage. */
async function readMeta(s3, bucket, day, stats) {
	const Key = `${day.replaceAll('-', '/')}/meta.json`
	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			const r = await s3.send(new GetObjectCommand({ Bucket: bucket, Key }))
			const parsed = JSON.parse(await r.Body.transformToString())
			return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
		} catch (e) {
			if (e?.name === 'NoSuchKey' || e?.$metadata?.httpStatusCode === 404) return {}
			if (attempt === 1) stats.metaUnreadable++
		}
	}
	return {}
}

async function fillUploaders(s3, bucket, rows, stats) {
	const days = [...new Set(rows.map((r) => r.day))]
	const metas = new Map()
	for (let i = 0; i < days.length; i += 8) {
		await Promise.all(days.slice(i, i + 8).map(async (d) => metas.set(d, await readMeta(s3, bucket, d, stats))))
	}
	for (const r of rows) {
		const v = metas.get(r.day)?.[r.path.split('/')[3]]
		r.uploadedBy = typeof v === 'string' && v.trim() ? v.trim().slice(0, 100) : null
	}
}

export function loadEnv(env = process.env) {
	let file = {}
	const p = new URL('../.env', import.meta.url)
	if (existsSync(p)) {
		file = Object.fromEntries(readFileSync(p, 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => {
			const i = l.indexOf('=')
			return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
		}))
	}
	const get = (k) => (env[k] ?? file[k] ?? '').replace(/\\n/g, '').trim()
	return { DATABASE_URL: get('DATABASE_URL'), bucket: get('GCS_BUCKET_NAME'), endpoint: get('S3_ENDPOINT') || 'https://s3.fr-par.scw.cloud', region: get('S3_REGION') || 'fr-par', accessKeyId: get('S3_ACCESS_KEY'), secretAccessKey: get('S3_SECRET_KEY') }
}

function splitSql(text) {
	return text.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n').split(/;\s*(?:\n|$)/).map((s) => s.trim()).filter(Boolean)
}

const UNCLASSIFIED_SQL = `SELECT p AS path FROM unnest($1::text[]) AS p WHERE NOT EXISTS (
  SELECT 1 FROM event_media e JOIN events ev ON ev.id = e.event_id AND ev.deleted_at IS NULL WHERE e.media_path = p)`

async function tryQuery(client, text, params) {
	// Une requête qui échoue (table absente en dry-run) ne doit pas empoisonner la connexion.
	await client.query('SAVEPOINT s')
	try {
		const r = await client.query(text, params)
		await client.query('RELEASE SAVEPOINT s')
		return r
	} catch {
		await client.query('ROLLBACK TO SAVEPOINT s')
		return null
	}
}

/**
 * Cœur du script : testable avec un faux S3 et un Postgres jetable. Retourne le rapport (aussi imprimé par main).
 * @param {{ s3: any, bucket: string, client: any, apply?: boolean, limit?: number | null, year?: string | null, migrationSql?: string | null }} opts
 */
export async function run({ s3, bucket, client, apply = false, limit = null, year = null, migrationSql = null }) {
	const report = { metaUnreadable: 0, limit, listed: 0, skipped: {}, candidates: 0, existing: 0, wouldInsert: 0, inserted: 0, images: 0, videos: 0, byYear: {}, byMonth: {}, tableMissing: false, unclassifiedNew: 0, unclassifiedTotal: 0, apply }
	await client.query('BEGIN')
	try {
		if (apply) {
			if (migrationSql) for (const stmt of splitSql(migrationSql)) await client.query(stmt)
		} else {
			await client.query('SET TRANSACTION READ ONLY') // dry-run : Postgres refuse toute écriture
		}
		const objects = await listAllObjects(s3, bucket, year ? `${year}/` : '')
		report.listed = objects.length
		const { rows, skipped } = selectRows(objects, { limit })
		report.skipped = skipped
		report.candidates = rows.length
		await fillUploaders(s3, bucket, rows, report)

		const existing = new Set()
		for (let i = 0; i < rows.length; i += BATCH) {
			const paths = rows.slice(i, i + BATCH).map((r) => r.path)
			const r = await tryQuery(client, 'SELECT path FROM media WHERE path = ANY($1::text[])', [paths])
			if (!r) { report.tableMissing = true; break }
			for (const x of r.rows) existing.add(x.path)
		}
		const fresh = rows.filter((r) => !existing.has(r.path))
		report.existing = existing.size
		report.wouldInsert = fresh.length
		for (const r of fresh) {
			r.kind === 'image' ? report.images++ : report.videos++
			const y = r.day.slice(0, 4), ym = r.day.slice(0, 7)
			report.byYear[y] = (report.byYear[y] ?? 0) + 1
			report.byMonth[ym] = (report.byMonth[ym] ?? 0) + 1
		}

		if (apply) {
			for (let i = 0; i < fresh.length; i += BATCH) {
				const batch = fresh.slice(i, i + BATCH)
				await client.query('SAVEPOINT b')
				const params = []
				const values = batch.map((r, k) => {
					params.push(r.path, r.day, r.kind, r.size, r.uploadedBy, r.uploadedAt)
					const o = k * 6
					return `($${o + 1}, $${o + 2}::date, $${o + 3}, $${o + 4}::bigint, $${o + 5}, COALESCE($${o + 6}::timestamptz, now()))`
				})
				const res = await client.query(`INSERT INTO media (path, day, kind, size, uploaded_by, uploaded_at) VALUES ${values.join(', ')} ON CONFLICT (path) DO NOTHING`, params)
				report.inserted += res.rowCount ?? 0
				await client.query('RELEASE SAVEPOINT b')
			}
		}

		// « À classer » : lignes sans évènement (hors évènements supprimés), existantes + nouvelles.
		const freshPaths = fresh.map((r) => r.path)
		for (let i = 0; i < freshPaths.length; i += BATCH) {
			const r = await tryQuery(client, UNCLASSIFIED_SQL, [freshPaths.slice(i, i + BATCH)])
			report.unclassifiedNew += r ? r.rows.length : freshPaths.slice(i, i + BATCH).length
		}
		if (apply) {
			const r = await client.query(`SELECT count(*)::int AS n FROM media m WHERE m.deleted_at IS NULL AND (m.skipped_at IS NULL OR m.skipped_at < now() - interval '30 days') AND NOT EXISTS (
				SELECT 1 FROM event_media e JOIN events ev ON ev.id = e.event_id AND ev.deleted_at IS NULL WHERE e.media_path = m.path)`)
			report.unclassifiedTotal = r.rows[0].n
		} else {
			const r = await tryQuery(client, `SELECT count(*)::int AS n FROM media m WHERE m.deleted_at IS NULL AND (m.skipped_at IS NULL OR m.skipped_at < now() - interval '30 days') AND NOT EXISTS (
				SELECT 1 FROM event_media e JOIN events ev ON ev.id = e.event_id AND ev.deleted_at IS NULL WHERE e.media_path = m.path)`)
			report.unclassifiedTotal = (r ? r.rows[0].n : 0) + report.unclassifiedNew
		}
		await client.query(apply ? 'COMMIT' : 'ROLLBACK')
	} catch (e) {
		await client.query('ROLLBACK').catch(() => {})
		throw e
	}
	return report
}

export function formatReport(r) {
	const L = []
	L.push(r.apply ? '== APPLY (atomique : un seul COMMIT, tout ou rien) ==' : '== DRY-RUN (rien n\'est écrit) ==')
	L.push(`Objets listés : ${r.listed} · retenus : ${r.candidates} · ignorés : ${Object.entries(r.skipped).map(([k, v]) => `${k} ${v}`).join(', ') || 'aucun'}`)
	if (r.limit) L.push(`⚠ --limit ${r.limit} : arrêt après ${r.limit} fichiers retenus, les compteurs d'ignorés (et les totaux) sont PARTIELS.`)
	if (r.metaUnreadable) L.push(`⚠ ${r.metaUnreadable} fichiers meta.json illisibles (uploaded_by laissé vide pour ces jours).`)
	if (r.tableMissing) L.push('Table media absente : toutes les lignes retenues seraient nouvelles (--apply la crée).')
	L.push(`Déjà indexés : ${r.existing} · ${r.apply ? 'insérés' : 'à insérer'} : ${r.apply ? r.inserted : r.wouldInsert} (photos ${r.images}, vidéos ${r.videos})`)
	for (const y of Object.keys(r.byYear).sort()) {
		L.push(`  ${y} : ${r.byYear[y]}`)
		for (const m of Object.keys(r.byMonth).sort().filter((k) => k.startsWith(y))) L.push(`    ${m} : ${r.byMonth[m]}`)
	}
	L.push(`À classer (sans évènement) : ${r.unclassifiedTotal}${r.apply ? '' : ' (après application)'}`)
	return L.join('\n')
}

/** Cible affichée en tête de CHAQUE exécution : bucket, endpoint, hôte:port/base (jamais d'identifiants). */
export function describeTarget(env, apply) {
	let db = 'base illisible'
	try {
		const u = new URL(env.DATABASE_URL)
		db = `${u.hostname}${u.port ? ':' + u.port : ''}${u.pathname}`
	} catch { /* garde le libellé neutre : on n'affiche jamais l'URL brute */ }
	return [`Mode : ${apply ? 'APPLY (écriture)' : 'DRY-RUN (lecture seule)'}`, `Bucket : ${env.bucket}`, `Endpoint S3 : ${env.endpoint}`, `Base : ${db}`].join('\n')
}

/** --apply n'écrit que sur confirmation explicite : --yes ou CONFIRM=1. Le dry-run ne l'exige pas. */
export function assertApplyConfirmed(opts, env = process.env) {
	if (opts.apply && !(opts.yes || env.CONFIRM === '1')) throw new Error('--apply écrit dans la base : ajoutez --yes (ou CONFIRM=1) pour confirmer')
}

async function main() {
	const opts = parseArgs(process.argv.slice(2))
	if (opts.help) { console.log(readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0]); return }
	assertApplyConfirmed(opts)
	const env = loadEnv()
	for (const k of ['DATABASE_URL', 'bucket', 'accessKeyId', 'secretAccessKey']) if (!env[k]) throw new Error(`configuration manquante : ${k === 'bucket' ? 'GCS_BUCKET_NAME' : k === 'accessKeyId' ? 'S3_ACCESS_KEY' : k === 'secretAccessKey' ? 'S3_SECRET_KEY' : k}`)
	console.log(describeTarget(env, opts.apply) + '\n')
	const s3 = new S3Client({ region: env.region, endpoint: env.endpoint, forcePathStyle: true, credentials: { accessKeyId: env.accessKeyId, secretAccessKey: env.secretAccessKey } })
	const client = new pg.Client({ connectionString: env.DATABASE_URL })
	await client.connect()
	try {
		const migrationSql = opts.apply ? readFileSync(new URL('./sql/002-media.sql', import.meta.url), 'utf8') : null
		const report = await run({ s3, bucket: env.bucket, client, apply: opts.apply, limit: opts.limit, year: opts.year, migrationSql })
		console.log(formatReport(report))
	} finally {
		await client.end()
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main().catch((e) => { console.error('Échec :', e.message); process.exit(1) })
}
