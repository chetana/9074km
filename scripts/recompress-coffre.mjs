#!/usr/bin/env node --experimental-strip-types
// @ts-nocheck
// Recompresse sur place les photos du coffre dont l'original existe encore sur le PC (même nom, même clé S3).
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { S3Client, ListObjectsV2Command, PutObjectCommand, CopyObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import sharp from 'sharp'
import { parseExif } from '../src/lib/exif.ts'

const USAGE = `Usage : node --experimental-strip-types scripts/recompress-coffre.mjs <dossier>... [--apply] [--max-dim 1600] [--quality 75]
  (défaut)  plan seul : rien n'est écrit
  --apply   copie l'ancienne version dans recompress-backup/<clé> puis remplace l'objet (JPEG mozjpeg, EXIF conservé),
            vérifie la taille et la date EXIF relue, puis met à jour media.size en UNE transaction sur la box
Ne touche QUE les photos dont l'original est dans les dossiers donnés ; ignore GIF, .webp, vidéos, noms ambigus, et tout objet
qui ne deviendrait pas au moins 10 % plus léger. Les dossiers sont lus récursivement.`

const args = process.argv.slice(2)
const val = (f, d) => (args.includes(f) ? args[args.indexOf(f) + 1] : d)
const dirs = args.filter((a, i) => !a.startsWith('--') && !['--max-dim', '--quality'].includes(args[i - 1]))
const APPLY = args.includes('--apply')
const MAX = Number(val('--max-dim', 1600))
const Q = Number(val('--quality', 75))
if (!dirs.length || dirs.some((d) => !existsSync(d)) || !(MAX >= 800) || !(Q >= 40 && Q <= 95)) { console.error(USAGE); process.exit(2) }

const envFile = fileURLToPath(new URL('../.env', import.meta.url))
const fileEnv = existsSync(envFile)
	? Object.fromEntries(readFileSync(envFile, 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
	: {}
const env = (k, d) => process.env[k] ?? fileEnv[k] ?? d
const Bucket = env('GCS_BUCKET_NAME', 'chet-lys-coffre')
const s3 = new S3Client({ region: env('S3_REGION', 'fr-par'), endpoint: env('S3_ENDPOINT', 'https://s3.fr-par.scw.cloud'), credentials: { accessKeyId: env('S3_ACCESS_KEY'), secretAccessKey: env('S3_SECRET_KEY') } })
const BOX = env('BOX', '163.172.7.239')
const BOX_KEY = env('BOX_KEY', `${process.env.HOME}/.ssh/chetbox`).replace(/^~/, process.env.HOME)

const stem = (n) => n.replace(/\.[^.]+$/, '').toLowerCase()
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`]))
const local = new Map()
for (const f of dirs.flatMap(walk).filter((f) => /\.jpe?g$/i.test(f))) {
	const k = stem(f.split('/').pop())
	local.set(k, local.has(k) ? null : f)
}

const byStem = new Map()
let token
do {
	const r = await s3.send(new ListObjectsV2Command({ Bucket, ContinuationToken: token }))
	for (const o of r.Contents ?? []) {
		if (!/^\d{4}\/\d{2}\/\d{2}\/[^/]+\.jpe?g$/i.test(o.Key)) continue
		const k = stem(o.Key.split('/').pop())
		byStem.set(k, byStem.has(k) ? null : { key: o.Key, size: o.Size })
	}
	token = r.NextContinuationToken
} while (token)

const stats = { candidates: 0, done: 0, light: 0, ambiguous: 0, exifLost: 0, errors: 0, before: 0, after: 0 }
const updates = []
const todo = [...local.entries()].filter(([k]) => byStem.has(k))
let next = 0
async function one([k, file]) {
	const obj = byStem.get(k)
	if (!file || !obj) { stats.ambiguous++; return }
	stats.candidates++
	const buf = readFileSync(file)
	const exOrig = parseExif(new Uint8Array(buf.subarray(0, 262144)))
	const out = await sharp(buf, { failOn: 'none' }).rotate().resize(MAX, MAX, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: Q, mozjpeg: true }).keepExif().toBuffer()
	if (out.length > obj.size * 0.9) { stats.light++; return }
	const exNew = parseExif(new Uint8Array(out.subarray(0, 262144)))
	if (exOrig?.takenAt && (exNew?.takenAt !== exOrig.takenAt || (exOrig.lat != null && exNew?.lat == null))) { stats.exifLost++; console.log('EXIF NON CONSERVÉ (ignorée) :', obj.key); return }
	stats.before += obj.size
	stats.after += out.length
	if (APPLY) {
		await s3.send(new CopyObjectCommand({ Bucket, Key: `recompress-backup/${obj.key}`, CopySource: `${Bucket}/${encodeURIComponent(obj.key).replaceAll('%2F', '/')}` }))
		await s3.send(new PutObjectCommand({ Bucket, Key: obj.key, Body: out, ContentType: 'image/jpeg' }))
		const h = await s3.send(new HeadObjectCommand({ Bucket, Key: obj.key }))
		if (h.ContentLength !== out.length) throw new Error(`taille inattendue ${obj.key}`)
	}
	updates.push(`UPDATE media SET size=${out.length} WHERE path='${obj.key.replace(/'/g, "''")}';`)
	stats.done++
	if (stats.done % 100 === 0) console.log(`… ${stats.done} traitées`)
}
async function worker() {
	while (next < todo.length) {
		const t = todo[next++]
		try { await one(t) } catch (e) { stats.errors++; console.log('ERREUR', t[0], String(e.message).slice(0, 100)) }
	}
}
await Promise.all([worker(), worker(), worker()])

const mo = (n) => (n / 1048576).toFixed(0)
console.log(`${APPLY ? 'FAIT' : 'PLAN'} : ${stats.done} à recompresser (${mo(stats.before)} Mo → ${mo(stats.after)} Mo), ${stats.light} déjà légères, ${stats.exifLost} EXIF non conservé, ${stats.ambiguous} noms ambigus, ${stats.errors} erreurs, ${local.size} originaux lus, ${todo.length} retrouvés dans S3`)
if (!APPLY) process.exit(stats.errors ? 1 : 0)
if (stats.errors) { console.error('Erreurs : base non modifiée (les objets déjà remplacés sont sauvegardés dans recompress-backup/). Relance le script.'); process.exit(1) }
const ssh = (cmd, input) => execFileSync('ssh', ['-i', BOX_KEY, '-o', 'ConnectTimeout=10', `root@${BOX}`, cmd], { input, encoding: 'utf8' })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
ssh(`docker exec chet-postgres-1 pg_dump -U chet chetana-portfolio | gzip > /opt/chet/backups/pre-events/chetana-portfolio-pre-recompress-${stamp}.sql.gz`)
ssh('docker exec -i chet-postgres-1 psql -v ON_ERROR_STOP=1 -q -U chet -d chetana-portfolio', `BEGIN;\n${updates.join('\n')}\nCOMMIT;`)
console.log('media.size mis à jour (1 transaction).')
