// getFiles doit suivre ContinuationToken (S3 plafonne à 1000 clés par page).
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('$env/dynamic/private', () => ({ env: { GCS_BUCKET_NAME: 'b' } }))
vi.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: vi.fn() }))

const sendMock = vi.fn()
vi.mock('@aws-sdk/client-s3', () => {
	class Cmd { constructor(public input: any) {} }
	return {
		S3Client: class { send(c: any) { return sendMock(c) } },
		GetObjectCommand: Cmd, PutObjectCommand: Cmd, DeleteObjectCommand: Cmd, HeadObjectCommand: Cmd,
		ListObjectsV2Command: Cmd,
	}
})

import { getGcsBucket } from './gcs'

beforeEach(() => sendMock.mockReset())

describe('getFiles pagination', () => {
	it('enchaîne les pages jusqu\'à IsTruncated=false et agrège fichiers + préfixes', async () => {
		sendMock
			.mockResolvedValueOnce({ Contents: [{ Key: '2026/01/01/a.jpg', Size: 1 }], CommonPrefixes: [{ Prefix: '2026/01/' }], IsTruncated: true, NextContinuationToken: 't1' })
			.mockResolvedValueOnce({ Contents: [{ Key: '2026/01/02/b.jpg', Size: 2 }], CommonPrefixes: [{ Prefix: '2026/01/' }, { Prefix: '2026/02/' }], IsTruncated: false })
		const [files, , api] = await getGcsBucket().getFiles({ prefix: '2026/' })
		expect(files.map((f) => f.name)).toEqual(['2026/01/01/a.jpg', '2026/01/02/b.jpg'])
		expect(api.prefixes).toEqual(['2026/01/', '2026/02/'])
		expect(sendMock).toHaveBeenCalledTimes(2)
		expect(sendMock.mock.calls[0][0].input.ContinuationToken).toBeUndefined()
		expect(sendMock.mock.calls[1][0].input.ContinuationToken).toBe('t1')
	})

	it('une seule page (≤ 1000 clés) : un seul appel, résultat identique à avant', async () => {
		sendMock.mockResolvedValueOnce({ Contents: [{ Key: 'k', Size: 5 }], IsTruncated: false })
		const [files, next, api] = await getGcsBucket().getFiles({ prefix: '' })
		expect(sendMock).toHaveBeenCalledTimes(1)
		expect(files).toHaveLength(1)
		expect(files[0].metadata.size).toBe(5)
		expect(next).toBeNull()
		expect(api.prefixes).toEqual([])
	})

	it('s\'arrête si IsTruncated sans jeton (pas de boucle infinie)', async () => {
		sendMock.mockResolvedValue({ Contents: [], IsTruncated: true })
		await getGcsBucket().getFiles({})
		expect(sendMock).toHaveBeenCalledTimes(1)
	})
})
