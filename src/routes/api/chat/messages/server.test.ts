// Tests d'intégration légers de la route chat/messages — dépendances (auth, S3, traduction,
// push) mockées, on vérifie la LOGIQUE : quand appelle-t-on l'IA de traduction (coût), et qui a
// le droit de supprimer quoi (sécurité). Signalé fragile par une revue de code du 22/09 :
// `user.name.split(' ')[0] === author` pour autoriser une suppression — pas de vraie identité,
// juste une comparaison de prénom.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const requireAuthMock = vi.fn()
vi.mock('$lib/server/auth', () => ({
	requireAuth: (event: unknown) => requireAuthMock(event),
}))

const files = new Map<string, string>()
const gcsFile = (name: string) => ({
	async download() {
		if (!files.has(name)) { const e: any = new Error('not found'); e.code = 404; throw e }
		return [Buffer.from(files.get(name)!)]
	},
	async save(data: string) { files.set(name, data) },
})
vi.mock('$lib/server/gcs', () => ({
	getGcsBucket: () => ({ file: gcsFile }),
}))

const geminiTranslateAllMock = vi.fn()
vi.mock('$lib/server/vertex', () => ({
	geminiTranslateAll: (...args: unknown[]) => geminiTranslateAllMock(...args),
}))

vi.mock('$lib/server/push', () => ({
	sendPushToOthers: vi.fn().mockResolvedValue(undefined),
}))

import { POST, DELETE } from './+server'

function fakeEvent(searchParams: Record<string, string>, body?: unknown) {
	const url = new URL('http://test.local/api/chat/messages?' + new URLSearchParams(searchParams).toString())
	return {
		url,
		request: { json: async () => body },
	} as any
}

beforeEach(() => {
	files.clear()
	requireAuthMock.mockReset()
	geminiTranslateAllMock.mockReset()
})

describe('POST /api/chat/messages — coût de traduction', () => {
	it('traductions déjà fournies par le client : n\'appelle PAS geminiTranslateAll (économie)', async () => {
		requireAuthMock.mockResolvedValue({ name: 'Chetana' })
		const res = await POST(fakeEvent({ y: '2026', m: '09', d: '22' }, {
			author: 'Chétana', text: 'Bonjour', fr: 'Bonjour', en: 'Hello', kh: 'សួស្តី', lang: 'fr',
		}))
		expect(res.status).toBe(200)
		expect(geminiTranslateAllMock).not.toHaveBeenCalled()
	})

	it('sans traductions fournies : appelle geminiTranslateAll avec le contexte des derniers messages', async () => {
		requireAuthMock.mockResolvedValue({ name: 'Chetana' })
		files.set('chat/2026/09/22.json', JSON.stringify([
			{ id: '1', author: 'Vornsok', text: 'Salut', fr: 'Salut', en: 'Hi', kh: 'សួស្តី', ts: '2026-09-22T10:00:00Z' },
		]))
		geminiTranslateAllMock.mockResolvedValue({ fr: 'Ça va ?', en: 'How are you?', kh: 'សុខសប្បាយទេ?', lang: 'fr' })

		await POST(fakeEvent({ y: '2026', m: '09', d: '22' }, { author: 'Chétana', text: 'Ça va ?' }))

		expect(geminiTranslateAllMock).toHaveBeenCalledTimes(1)
		const [text, author, context] = geminiTranslateAllMock.mock.calls[0]
		expect(text).toBe('Ça va ?')
		expect(author).toBe('Chétana')
		expect(context).toContain('Vornsok: Salut')
	})

	it('échec de traduction : le message est quand même stocké (champs vides), pas de 500', async () => {
		requireAuthMock.mockResolvedValue({ name: 'Chetana' })
		geminiTranslateAllMock.mockRejectedValue(new Error('GLM et Gemini tous les deux en panne'))

		const res = await POST(fakeEvent({ y: '2026', m: '09', d: '22' }, { author: 'Chétana', text: 'Ça va ?' }))

		expect(res.status).toBe(200)
		const saved = JSON.parse(files.get('chat/2026/09/22.json')!)
		expect(saved[0]).toMatchObject({ text: 'Ça va ?', fr: '', en: '', kh: '' })
	})
})

describe('DELETE /api/chat/messages — autorisation', () => {
	beforeEach(() => {
		files.set('chat/2026/09/22.json', JSON.stringify([
			{ id: 'msg-1', author: 'Chétana', text: 'moi', fr: 'moi', en: 'me', kh: 'ខ្ញុំ', ts: '2026-09-22T10:00:00Z' },
			{ id: 'msg-2', author: 'Vornsok', text: 'elle', fr: 'elle', en: 'her', kh: 'នាង', ts: '2026-09-22T10:01:00Z' },
		]))
	})

	it('ne peut pas supprimer le message d\'un autre auteur même en étant connecté (403)', async () => {
		requireAuthMock.mockResolvedValue({ name: 'Chetana' }) // auth "Chetana" ≠ author "Vornsok" du message msg-2
		await expect(DELETE(fakeEvent({ y: '2026', m: '09', d: '22', id: 'msg-2' }))).rejects.toMatchObject({ status: 403 })
	})

	it('ne peut PAS supprimer le message de quelqu\'un d\'autre (403)', async () => {
		requireAuthMock.mockResolvedValue({ name: 'Vornsok' })
		await expect(DELETE(fakeEvent({ y: '2026', m: '09', d: '22', id: 'msg-1' }))).rejects.toMatchObject({ status: 403 })
		// le message n'a pas été supprimé
		const saved = JSON.parse(files.get('chat/2026/09/22.json')!)
		expect(saved).toHaveLength(2)
	})

	it('peut supprimer son propre message quand le prénom matche exactement', async () => {
		requireAuthMock.mockResolvedValue({ name: 'Chétana' }) // même orthographe que l'auteur stocké
		const res = await DELETE(fakeEvent({ y: '2026', m: '09', d: '22', id: 'msg-1' }))
		expect(res.status).toBe(200)
		const saved = JSON.parse(files.get('chat/2026/09/22.json')!)
		expect(saved).toHaveLength(1)
		expect(saved[0].id).toBe('msg-2')
	})

	it('404 si le message n\'existe pas', async () => {
		requireAuthMock.mockResolvedValue({ name: 'Chétana' })
		await expect(DELETE(fakeEvent({ y: '2026', m: '09', d: '22', id: 'inconnu' }))).rejects.toMatchObject({ status: 404 })
	})
})
