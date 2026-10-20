#!/usr/bin/env node --experimental-strip-types
// @ts-nocheck
// Encode des vidéos (H.264 480p faststart) et envoi dans le coffre, rangées par date ; remplace sur place si déjà présentes.
import { readFileSync, readdirSync, existsSync, mkdtempSync, rmSync, statSync, openSync, readSync, closeSync } from 'node:fs'
import { execFileSync, spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { S3Client, ListObjectsV2Command, PutObjectCommand, CopyObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'

const USAGE = `Usage : node --experimental-strip-types scripts/encode-videos.mjs <dossier>... [--apply] [--limit N] [--date YYYY-MM-DD]
  (défaut)  plan seul : rien n'est encodé, envoyé ni écrit
  --apply   encode (H.264 main, 480 px sur le petit côté, CRF 27, plafond 1 Mbit/s, AAC 64k, index en tête), vérifie la sortie
            (H.264, durée, index en tête), envoie vers S3, puis écrit media (+ rattachement à l'évènement des photos voisines) en UNE transaction
  --limit N s'arrête après N vidéos ;  --date  date des vidéos sans date dans le nom (midi)
Une vidéo déjà dans le coffre (même nom) est remplacée sur place après copie dans encode-backup/<clé> ; une vidéo déjà encodée par ce script
est sautée ; une vidéo sans date dans son nom est ignorée sans --date. Env (ou .env) : S3_*, GCS_BUCKET_NAME ; BOX, BOX_KEY pour la base.`

const args = process.argv.slice(2)
const val = (f) => (args.includes(f) ? args[args.indexOf(f) + 1] : undefined)
const dirs = args.filter((a, i) => !a.startsWith('--') && !['--limit', '--date'].includes(args[i - 1]))
const APPLY = args.includes('--apply')
const LIMIT = val('--limit') ? Number(val('--limit')) : Infinity
const FALLBACK_DAY = val('--date')
if (!dirs.length || dirs.some((d) => !existsSync(d)) || !(LIMIT >= 1) || (FALLBACK_DAY && !/^\d{4}-\d{2}-\d{2}$/.test(FALLBACK_DAY))) { console.error(USAGE); process.exit(2) }

const envFile = fileURLToPath(new URL('../.env', import.meta.url))
const fileEnv = existsSync(envFile)
	? Object.fromEntries(readFileSync(envFile, 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
	: {}
const env = (k, d) => process.env[k] ?? fileEnv[k] ?? d
const Bucket = env('GCS_BUCKET_NAME', 'chet-lys-coffre')
const s3 = new S3Client({ region: env('S3_REGION', 'fr-par'), endpoint: env('S3_ENDPOINT', 'https://s3.fr-par.scw.cloud'), credentials: { accessKeyId: env('S3_ACCESS_KEY'), secretAccessKey: env('S3_SECRET_KEY') } })
const BOX = env('BOX', '163.172.7.239')
const BOX_KEY = env('BOX_KEY', `${process.env.HOME}/.ssh/chetbox`).replace(/^~/, process.env.HOME)
const UPLOADER = env('IMPORT_UPLOADER', 'import')
const TAG = '480p-v1'

const stem = (n) => n.replace(/\.[^.]+$/, '').toLowerCase()
const q = (s) => (s == null ? 'NULL' : `'${String(s).replace(/'/g, "''")}'`)
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`]))
const probe = (f) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', f], { encoding: 'utf8' }))

function moovFirst(path) {
	const fd = openSync(path, 'r')
	try {
		const size = statSync(path).size
		let pos = 0
		while (pos + 8 <= size) {
			const h = Buffer.alloc(8)
			readSync(fd, h, 0, 8, pos)
			let sz = h.readUInt32BE(0)
			const t = h.toString('latin1', 4, 8)
			if (t === 'moov') return true
			if (t === 'mdat') return false
			if (sz === 1) { const b = Buffer.alloc(8); readSync(fd, b, 0, 8, pos + 8); sz = Number(b.readBigUInt64BE(0)) }
			if (sz < 8) return false
			pos += sz
		}
	} finally { closeSync(fd) }
	return false
}

function dayOf(name) {
	const m = name.match(/((?:19|20)\d{2})(\d{2})(\d{2})[_-]?(\d{2})(\d{2})(\d{2})/) ?? name.match(/((?:19|20)\d{2})(\d{2})(\d{2})/)
	const iso = m ? `${m[1]}-${m[2]}-${m[3]}T${m[4] ?? '12'}:${m[5] ?? '00'}:${m[6] ?? '00'}` : FALLBACK_DAY ? `${FALLBACK_DAY}T12:00:00` : null
	if (!iso || !Number.isFinite(Date.parse(iso)) || !new Date(Date.parse(iso)).toISOString().startsWith(iso.slice(0, 10))) return FALLBACK_DAY ? `${FALLBACK_DAY}T12:00:00` : null
	return iso >= '1990' && iso < '2036' ? iso : null
}

function encode(src, out) {
	const vf = "scale='if(gt(iw,ih),-2,480)':'if(gt(iw,ih),480,-2)',fps=fps=30:round=down,format=yuv420p"
	return new Promise((ok, ko) => {
		const p = spawn('ffmpeg', ['-y', '-v', 'error', '-i', src, '-vf', vf, '-c:v', 'libx264', '-preset', 'slow', '-crf', '27', '-maxrate', '1000k', '-bufsize', '2000k', '-profile:v', 'main', '-threads', '8', '-c:a', 'aac', '-b:a', '64k', '-ac', '2', '-movflags', '+faststart', out], { stdio: ['ignore', 'ignore', 'pipe'] })
		let err = ''
		p.stderr.on('data', (d) => (err += d))
		p.on('close', (c) => (c === 0 ? ok() : ko(new Error(err.slice(0, 200)))))
	})
}

const list = []
let token
do {
	const r = await s3.send(new ListObjectsV2Command({ Bucket, ContinuationToken: token }))
	list.push(...(r.Contents ?? []))
	token = r.NextContinuationToken
} while (token)
const live = new Map()
for (const o of list) if (/^\d{4}\/\d{2}\/\d{2}\/[^/]+\.(mp4|mov|webm|avi|mkv)$/i.test(o.Key)) { const k = stem(o.Key.split('/').pop()); live.set(k, live.has(k) ? null : o) }

const sources = new Map()
for (const f of dirs.flatMap(walk).filter((f) => /\.(mp4|mov)$/i.test(f))) { const k = stem(f.split('/').pop()); sources.set(k, sources.has(k) ? null : f) }
const stats = { neuves: 0, remplacees: 0, deja: 0, sansDate: 0, ambigues: 0, erreurs: 0, avant: 0, apres: 0 }
const todo = []
for (const [k, f] of sources) {
	if (!f) { stats.ambigues++; continue }
	const o = live.get(k)
	if (o === null) { stats.ambigues++; continue }
	if (o) {
		const h = await s3.send(new HeadObjectCommand({ Bucket, Key: o.Key }))
		if (h.Metadata?.enc === TAG) { stats.deja++; continue }
		todo.push({ f, existing: o, iso: dayOf(f.split('/').pop()) })
		continue
	}
	const iso = dayOf(f.split('/').pop())
	if (!iso) { stats.sansDate++; console.log('SANS DATE (ignorée) :', f); continue }
	todo.push({ f, existing: null, iso })
}
const batch = todo.slice(0, LIMIT)
console.log(`${batch.length} vidéos à traiter (${batch.filter((t) => t.existing).length} remplacements, ${batch.filter((t) => !t.existing).length} nouvelles), ${stats.deja} déjà encodées, ${stats.sansDate} sans date, ${stats.ambigues} noms ambigus`)
if (!APPLY) process.exit(0)

const work = mkdtempSync(`${tmpdir()}/encode-videos-`)
const sql = []
let next = 0
async function one(t) {
	const name = t.f.split('/').pop()
	const info = probe(t.f)
	const v = info.streams.find((s) => s.codec_type === 'video')
	const dur = Number(info.format.duration)
	const out = `${work}/${stem(name)}.mp4`
	await encode(t.f, out)
	const o = probe(out)
	const ov = o.streams.find((s) => s.codec_type === 'video')
	if (ov.codec_name !== 'h264' || Math.abs(Number(o.format.duration) - dur) > Math.max(0.5, dur * 0.01) || !moovFirst(out)) throw new Error(`sortie invalide ${name}`)
	const size = statSync(out).size
	const key = t.existing?.Key ?? `${t.iso.slice(0, 10).replaceAll('-', '/')}/${name.replace(/\.[^.]+$/, '')}.mp4`
	if (t.existing && size > t.existing.Size * 0.9) { stats.deja++; return }
	if (t.existing) await s3.send(new CopyObjectCommand({ Bucket, Key: `encode-backup/${key}`, CopySource: `${Bucket}/${encodeURIComponent(key).replaceAll('%2F', '/')}` }))
	await s3.send(new PutObjectCommand({ Bucket, Key: key, Body: readFileSync(out), ContentType: 'video/mp4', Metadata: { enc: TAG } }))
	const h = await s3.send(new HeadObjectCommand({ Bucket, Key: key }))
	if (h.ContentLength !== size) throw new Error(`taille inattendue ${key}`)
	rmSync(out)
	stats.avant += statSync(t.f).size
	stats.apres += size
	const taken = t.iso.replace('T', ' ')
	if (t.existing) { sql.push(`UPDATE media SET size=${size} WHERE path=${q(key)};`); stats.remplacees++ }
	else {
		sql.push(`INSERT INTO media (path,day,kind,size,uploaded_by,taken_at) VALUES (${q(key)},${q(t.iso.slice(0, 10))},'video',${size},${q(UPLOADER)},${q(taken)}) ON CONFLICT (path) DO UPDATE SET size=EXCLUDED.size;`)
		sql.push(`INSERT INTO event_media (media_path,event_id) SELECT ${q(key)},(SELECT em.event_id FROM media m JOIN event_media em ON em.media_path=m.path WHERE m.day=${q(t.iso.slice(0, 10))} AND m.kind='image' AND m.taken_at IS NOT NULL ORDER BY abs(extract(epoch FROM m.taken_at - ${q(taken)}::timestamp)) LIMIT 1) WHERE EXISTS (SELECT 1 FROM media m JOIN event_media em ON em.media_path=m.path WHERE m.day=${q(t.iso.slice(0, 10))} AND m.kind='image') AND ${q(key)} NOT IN (SELECT media_path FROM event_media) ON CONFLICT DO NOTHING;`)
		stats.neuves++
	}
	if ((stats.neuves + stats.remplacees) % 10 === 0) console.log(`… ${stats.neuves + stats.remplacees} vidéos`)
}
async function worker() {
	while (next < batch.length) {
		const t = batch[next++]
		try { await one(t) } catch (e) { stats.erreurs++; console.log('ERREUR', t.f.split('/').pop(), String(e.message).slice(0, 120)) }
	}
}
await Promise.all([worker(), worker(), worker()])
rmSync(work, { recursive: true, force: true })

const mo = (n) => (n / 1048576).toFixed(0)
console.log(`FAIT : ${stats.neuves} nouvelles, ${stats.remplacees} remplacées, ${stats.deja} déjà légères, ${stats.erreurs} erreurs (${mo(stats.avant)} Mo → ${mo(stats.apres)} Mo)`)
if (stats.erreurs) { console.error('Erreurs : base NON modifiée. Relance le script (reprise : les vidéos déjà encodées sont sautées).'); process.exit(1) }
if (!sql.length) process.exit(0)
const ssh = (cmd, input) => execFileSync('ssh', ['-i', BOX_KEY, '-o', 'ConnectTimeout=10', `root@${BOX}`, cmd], { input, encoding: 'utf8' })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
ssh(`docker exec chet-postgres-1 pg_dump -U chet chetana-portfolio | gzip > /opt/chet/backups/pre-events/chetana-portfolio-pre-videos-${stamp}.sql.gz`)
ssh('docker exec -i chet-postgres-1 psql -v ON_ERROR_STOP=1 -q -U chet -d chetana-portfolio', `BEGIN;\n${sql.join('\n')}\nCOMMIT;`)
console.log('Base mise à jour (1 transaction).')
