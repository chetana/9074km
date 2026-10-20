import { describe, it, expect, vi, beforeEach } from 'vitest'

const requireAuthMock = vi.fn()
vi.mock('$lib/server/auth', () => ({ requireAuth: (e: unknown) => requireAuthMock(e) }))

const s3Delete = vi.fn()
vi.mock('$lib/server/gcs', () => ({ getGcsBucket: () => ({ file: (p: string) => ({ delete: () => s3Delete(p) }) }) }))

const ensureMock = vi.fn()
vi.mock('$lib/server/coffre-db', () => ({ ensureCoffreSchema: () => ensureMock() }))
const forgetMock = vi.fn()
vi.mock('$lib/server/events-store', () => ({ forgetMediaPath: (p: string) => forgetMock(p) }))

import { DELETE } from './+server'

const ev = (path: string | null) => ({ url: new URL('http://t/api/coffre/delete' + (path ? `?path=${encodeURIComponent(path)}` : '')), request: {} }) as any

beforeEach(() => {
	for (const m of [requireAuthMock, s3Delete, ensureMock, forgetMock]) m.mockReset()
	requireAuthMock.mockResolvedValue({ id: 1 })
	s3Delete.mockResolvedValue(undefined)
	ensureMock.mockResolvedValue(undefined)
	forgetMock.mockResolvedValue(undefined)
})

describe('DELETE /api/coffre/delete', () => {
	it('S3 OK + Postgres OK : succès et la photo est détachée de son évènement', async () => {
		const res = await DELETE(ev('2026/10/11/a.jpg'))
		expect((await res.json()).success).toBe(true)
		expect(s3Delete).toHaveBeenCalledWith('2026/10/11/a.jpg')
		expect(forgetMock).toHaveBeenCalledWith('2026/10/11/a.jpg')
	})

	it('S3 OK + Postgres KO : la route répond quand même succès (erreur journalisée)', async () => {
		const err = vi.spyOn(console, 'error').mockImplementation(() => {})
		forgetMock.mockRejectedValue(new Error('pg down'))
		const res = await DELETE(ev('2026/10/11/a.jpg'))
		expect((await res.json()).success).toBe(true)
		expect(err).toHaveBeenCalled()
		err.mockRestore()
	})

	it('schéma indisponible (ensureCoffreSchema KO) : succès aussi', async () => {
		const err = vi.spyOn(console, 'error').mockImplementation(() => {})
		ensureMock.mockRejectedValue(new Error('no db'))
		expect((await DELETE(ev('2026/10/11/a.jpg'))).status).toBe(200)
		expect(forgetMock).not.toHaveBeenCalled()
		err.mockRestore()
	})

	it('Postgres qui ne répond pas : la suppression ne reste pas bloquée (timeout)', async () => {
		vi.useFakeTimers()
		const err = vi.spyOn(console, 'error').mockImplementation(() => {})
		forgetMock.mockReturnValue(new Promise(() => {}))
		const p = DELETE(ev('2026/10/11/a.jpg'))
		await vi.advanceTimersByTimeAsync(3100)
		expect((await p).status).toBe(200)
		vi.useRealTimers()
		err.mockRestore()
	})

	it('S3 KO : l\'erreur remonte et Postgres n\'est pas touché', async () => {
		s3Delete.mockRejectedValue(new Error('s3 down'))
		await expect(DELETE(ev('2026/10/11/a.jpg'))).rejects.toThrow('s3 down')
		expect(forgetMock).not.toHaveBeenCalled()
	})

	it('chemin invalide ou absent : 400, rien n\'est supprimé', async () => {
		await expect(DELETE(ev(null))).rejects.toMatchObject({ status: 400 })
		await expect(DELETE(ev('chat/2026/09/22.json'))).rejects.toMatchObject({ status: 400 })
		expect(s3Delete).not.toHaveBeenCalled()
		expect(forgetMock).not.toHaveBeenCalled()
	})
})
