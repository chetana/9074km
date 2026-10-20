#!/usr/bin/env node --experimental-strip-types
// @ts-nocheck
// Import d'un dossier de photos (export Google Photos) : compression comme l'app, rangé par date EXIF.
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { S3Client, ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3'
import sharp from 'sharp'
import { parseExif } from '../src/lib/exif.ts'

const USAGE = `Usage : node --experimental-strip-types scripts/import-photos.mjs <dossier> [--event ID] [--apply]
  (défaut)   plan seul : rien n'est envoyé ni écrit
  --apply    envoie vers S3, sauvegarde la base sur la box, applique le SQL en UNE transaction
  --event ID rattache les photos du dossier à l'évènement, sans déplacer une photo d'un autre évènement
Photos : 2048 px max, JPEG q85, EXIF conservé, rangées dans YYYY/MM/DD/ (date EXIF, sinon nom IMG_YYYYMMDD_HHMMSS).
GIF envoyés tels quels, vidéos ignorées. Relançable : un nom déjà dans le bucket n'est jamais renvoyé.
Env (ou .env) : GCS_BUCKET_NAME, S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY, S3_SECRET_KEY ; BOX, BOX_KEY pour la base.`

const args = process.argv.slice(2)
const evIdx = args.indexOf('--event')
const dir = args.find((a, i) => !a.startsWith('--') && i !== evIdx + 1)
const APPLY = args.includes('--apply')
const eventId = evIdx >= 0 ? Number(args[evIdx + 1]) : null
if (!dir || !existsSync(dir) || (evIdx >= 0 && !Number.isInteger(eventId))) {
	console.error(USAGE)
	process.exit(2)
}

const envFile = fileURLToPath(new URL('../.env', import.meta.url))
const fileEnv = existsSync(envFile)
	? Object.fromEntries(readFileSync(envFile, 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
	: {}
const env = (k, d) => process.env[k] ?? fileEnv[k] ?? d
const Bucket = env('GCS_BUCKET_NAME', 'chet-lys-coffre')
const s3 = new S3Client({
	region: env('S3_REGION', 'fr-par'),
	endpoint: env('S3_ENDPOINT', 'https://s3.fr-par.scw.cloud'),
	credentials: { accessKeyId: env('S3_ACCESS_KEY'), secretAccessKey: env('S3_SECRET_KEY') }
})
const BOX = env('BOX', '163.172.7.239')
const BOX_KEY = env('BOX_KEY', `${process.env.HOME}/.ssh/chetbox`).replace(/^~/, process.env.HOME)
const UPLOADER = env('IMPORT_UPLOADER', 'import')

const stem = (n) => n.replace(/\.[^.]+$/, '').toLowerCase()
const q = (s) => (s == null ? 'NULL' : `'${String(s).replace(/'/g, "''")}'`)
const num = (v) => (v == null ? 'NULL' : v)

const have = new Map()
let token
do {
	const r = await s3.send(new ListObjectsV2Command({ Bucket, ContinuationToken: token }))
	for (const o of r.Contents ?? []) {
		if (/^\d{4}\/\d{2}\/\d{2}\/[^/]+$/.test(o.Key) && !/(meta\.json|reactions\.json|note\.txt)$/.test(o.Key)) have.set(stem(o.Key.split('/').pop()), o.Key)
	}
	token = r.NextContinuationToken
} while (token)

const all = readdirSync(dir)
const files = all.filter((f) => /\.(jpe?g|gif)$/i.test(f)).sort()
const stats = { envoyees: 0, deja: 0, sansDate: 0, erreurs: 0, videos: all.filter((f) => /\.(mp4|mov)$/i.test(f)).length }
const sql = ['BEGIN;']
const paths = []
let next = 0

async function one(f) {
	const buf = readFileSync(`${dir}/${f}`)
	const ex = /\.jpe?g$/i.test(f) ? parseExif(new Uint8Array(buf.subarray(0, 262144))) : null
	const m = f.match(/(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/)
	const takenAt = ex?.takenAt ?? (m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}` : null)
	if (!takenAt) { stats.sansDate++; console.log('SANS DATE (ignorée) :', f); return }
	const day = takenAt.slice(0, 10)
	const taken = q(takenAt.replace('T', ' '))
	const existing = have.get(stem(f))
	if (existing) {
		stats.deja++
		paths.push(existing)
		sql.push(`UPDATE media SET taken_at=${taken},taken_offset=${q(ex?.offset)},lat=${num(ex?.lat)},lng=${num(ex?.lng)},make=${q(ex?.make)},model=${q(ex?.model)} WHERE path=${q(existing)} AND taken_at IS NULL;`)
		return
	}
	const isGif = /\.gif$/i.test(f)
	const out = isGif ? buf : await sharp(buf, { failOn: 'none' }).rotate().resize(2048, 2048, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).keepExif().toBuffer()
	const path = `${day.replaceAll('-', '/')}/${f}`
	if (APPLY) await s3.send(new PutObjectCommand({ Bucket, Key: path, Body: out, ContentType: isGif ? 'image/gif' : 'image/jpeg' }))
	stats.envoyees++
	paths.push(path)
	sql.push(`INSERT INTO media (path,day,kind,size,uploaded_by,taken_at,taken_offset,lat,lng,make,model) VALUES (${q(path)},${q(day)},'image',${out.length},${q(UPLOADER)},${taken},${q(ex?.offset)},${num(ex?.lat)},${num(ex?.lng)},${q(ex?.make)},${q(ex?.model)}) ON CONFLICT DO NOTHING;`)
	if (stats.envoyees % 25 === 0) console.log(`… ${stats.envoyees} envoyées`)
}
async function worker() {
	while (next < files.length) {
		const f = files[next++]
		try { await one(f) } catch (e) { stats.erreurs++; console.log('ERREUR', f, String(e.message).slice(0, 100)) }
	}
}
await Promise.all([worker(), worker(), worker()])

if (eventId) {
	const list = paths.map(q).join(',') || "''"
	sql.push(`INSERT INTO event_media (media_path,event_id) SELECT path,${eventId} FROM media WHERE path IN (${list}) AND deleted_at IS NULL AND path NOT IN (SELECT media_path FROM event_media) ON CONFLICT DO NOTHING;`)
}
sql.push('COMMIT;')

console.log(`${APPLY ? 'S3 :' : 'PLAN :'} ${stats.envoyees} à envoyer/envoyées, ${stats.deja} déjà dans S3, ${stats.sansDate} sans date, ${stats.erreurs} erreurs, ${stats.videos} vidéos ignorées`)
if (!APPLY) process.exit(stats.erreurs ? 1 : 0)
if (stats.erreurs) { console.error('Erreurs : base NON modifiée. Relance le script (reprise sans doublon).'); process.exit(1) }

const ssh = (cmd, input) => execFileSync('ssh', ['-i', BOX_KEY, '-o', 'ConnectTimeout=10', `root@${BOX}`, cmd], { input, encoding: 'utf8' })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const backup = `/opt/chet/backups/pre-events/chetana-portfolio-pre-import-${stamp}.sql.gz`
ssh(`docker exec chet-postgres-1 pg_dump -U chet chetana-portfolio | gzip > ${backup}`)
console.log('Base sauvegardée :', backup)
ssh('docker exec -i chet-postgres-1 psql -v ON_ERROR_STOP=1 -q -U chet -d chetana-portfolio', sql.join('\n'))
console.log('Base mise à jour (1 transaction).')
