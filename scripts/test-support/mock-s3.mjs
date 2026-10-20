// @ts-nocheck
// Faux S3 local (ListObjectsV2 paginé + GetObject) pour tester les scripts sans toucher au vrai bucket.
import http from 'node:http'

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** objects : Map<clé, { body?, size?, lastModified?, status? (erreur permanente), failFirst? (n premières erreurs 500) }>. Renvoie { url, close, requests }. */
export async function startMockS3(objects, { pageSize = 1000 } = {}) {
	const requests = []
	const server = http.createServer((req, res) => {
		const url = new URL(req.url, 'http://x')
		requests.push(`${req.method} ${url.pathname}${url.search}`)
		const parts = url.pathname.split('/').filter(Boolean) // [bucket, ...clé]
		if (parts.length <= 1 && url.searchParams.get('list-type') === '2') {
			const prefix = url.searchParams.get('prefix') ?? ''
			const keys = [...objects.keys()].filter((k) => k.startsWith(prefix)).sort()
			const start = Number(url.searchParams.get('continuation-token') ?? 0)
			const page = keys.slice(start, start + pageSize)
			const truncated = start + pageSize < keys.length
			const xml = `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Name>${esc(parts[0] ?? '')}</Name><Prefix>${esc(prefix)}</Prefix><KeyCount>${page.length}</KeyCount><MaxKeys>${pageSize}</MaxKeys><IsTruncated>${truncated}</IsTruncated>${truncated ? `<NextContinuationToken>${start + pageSize}</NextContinuationToken>` : ''}${page.map((k) => { const o = objects.get(k); return `<Contents><Key>${esc(k)}</Key><LastModified>${o.lastModified ?? '2026-10-01T12:00:00.000Z'}</LastModified><ETag>"x"</ETag><Size>${o.size ?? (o.body ?? '').length}</Size><StorageClass>STANDARD</StorageClass></Contents>` }).join('')}</ListBucketResult>`
			res.writeHead(200, { 'Content-Type': 'application/xml' }).end(xml)
			return
		}
		const key = decodeURIComponent(parts.slice(1).join('/'))
		const o = objects.get(key)
		if (o && o.status) return res.writeHead(o.status, { 'Content-Type': 'application/xml' }).end('<Error><Code>InternalError</Code></Error>')
		if (o && o.failFirst > 0) { o.failFirst--; return res.writeHead(500, { 'Content-Type': 'application/xml' }).end('<Error><Code>InternalError</Code></Error>') }
		if (!o) return res.writeHead(404, { 'Content-Type': 'application/xml' }).end('<Error><Code>NoSuchKey</Code></Error>')
		res.writeHead(200, { 'Content-Type': 'application/octet-stream' }).end(o.body ?? '')
	})
	await new Promise((r) => server.listen(0, '127.0.0.1', r))
	return { url: `http://127.0.0.1:${server.address().port}`, requests, close: () => new Promise((r) => server.close(r)) }
}
