import { describe, it, expect, vi, beforeEach } from 'vitest'

const state: { dev: boolean; env: Record<string, string | undefined>; logtoUser: any; dbRows: any[]; inserted: any[] } = {
	dev: false, env: {}, logtoUser: undefined, dbRows: [], inserted: [],
}

vi.mock('$env/dynamic/private', () => ({ env: new Proxy({}, { get: (_t, k: string) => state.env[k] }) }))
vi.mock('$app/environment', () => ({ get dev() { return state.dev } }))
vi.mock('@logto/sveltekit', () => ({
	handleLogto: () => ({ event, resolve }: any) => { if (state.logtoUser) event.locals.user = state.logtoUser; return resolve(event) },
	UserScope: { Email: 'email', Profile: 'profile' },
}))
vi.mock('@sveltejs/kit/hooks', () => ({ sequence: (...hs: any[]) => async ({ event, resolve }: any) => { const run = (i: number, ev: any): any => (i === hs.length ? resolve(ev) : hs[i]({ event: ev, resolve: (e: any) => run(i + 1, e) })); return run(0, event) } }))
vi.mock('$lib/server/db', () => ({
	getDB: () => ({
		select: () => ({ from: () => ({ where: async () => state.dbRows }) }),
		update: () => ({ set: () => ({ where: async () => undefined }) }),
		insert: () => ({ values: (v: any) => ({ returning: async () => { state.inserted.push(v); return [{ id: 99, name: v.name, picture: v.picture }] } }) }),
	}),
}))

const mkEvent = (path: string, opts: { ip?: string; cookie?: boolean } = {}) => {
	const headers = new Headers(opts.ip ? { 'x-forwarded-for': opts.ip } : {})
	return {
		url: new URL('http://x' + path),
		request: new Request('http://x' + path, { headers }),
		cookies: { get: () => (opts.cookie ? 'c' : undefined) },
		locals: {} as any,
	}
}
const run = async (path: string, opts: { ip?: string; cookie?: boolean } = {}) => {
	const { handle } = await import('../../hooks.server')
	const ev = mkEvent(path, opts)
	const res: Response = await (handle as any)({ event: ev, resolve: async () => new Response('ok', { status: 200 }) })
	return { res, ev }
}

beforeEach(() => {
	vi.resetModules()
	state.dev = false
	state.env = { ALLOWED_EMAILS: 'chetana.yin@gmail.com,vornsoklyly28@gmail.com' }
	state.logtoUser = undefined
	state.dbRows = [{ id: 1, name: 'Chet', picture: '', email: 'chetana.yin@gmail.com' }]
	state.inserted = []
})

describe('liste d\'e-mails autorisés (vrai hooks.server.ts)', () => {
	it('un compte autorisé reçoit sa session', async () => {
		state.logtoUser = { sub: 'a', email: 'chetana.yin@gmail.com', name: 'Chet' }
		const { res, ev } = await run('/api/coffre/events', { cookie: true, ip: '1.1.1.1' })
		expect(res.status).toBe(200)
		expect(ev.locals.dbUser?.email).toBe('chetana.yin@gmail.com')
	})
	it('un compte connecté mais hors liste est refusé en 403 sur /api, sans ligne créée', async () => {
		state.dbRows = []
		state.logtoUser = { sub: 'z', email: 'pirate@gmail.com', name: 'P' }
		const { res, ev } = await run('/api/coffre/events', { cookie: true, ip: '2.2.2.2' })
		expect(res.status).toBe(403)
		expect(ev.locals.dbUser).toBeUndefined()
		expect(state.inserted).toHaveLength(0)
	})
	it('idem sur une page : 403 HTML avec lien de déconnexion', async () => {
		state.dbRows = []
		state.logtoUser = { sub: 'z', email: 'yincgame@gmail.com', name: 'P' }
		const { res } = await run('/coffre', { cookie: true, ip: '2.2.2.2' })
		expect(res.status).toBe(403)
		expect(await res.text()).toContain('/api/auth/sign-out')
	})
	it('un compte refusé peut quand même se déconnecter et lire /api/version', async () => {
		state.logtoUser = { sub: 'z', email: 'pirate@gmail.com', name: 'P' }
		expect((await run('/api/auth/sign-out', { cookie: true, ip: '2.2.2.2' })).res.status).toBe(200)
		expect((await run('/api/version', { cookie: true, ip: '2.2.2.2' })).res.status).toBe(200)
	})
	it('ALLOWED_EMAILS absente en production : personne n\'entre (échec fermé)', async () => {
		state.env = {}
		state.logtoUser = { sub: 'a', email: 'chetana.yin@gmail.com', name: 'Chet' }
		const { res } = await run('/api/coffre/events', { cookie: true, ip: '1.1.1.1' })
		expect(res.status).toBe(403)
	})
})

describe('rate-limit réservé aux anonymes (vrai hooks.server.ts)', () => {
	it('un anonyme est bloqué à la 121e requête de la minute', async () => {
		const { handle } = await import('../../hooks.server')
		let last = 200
		for (let i = 0; i < 121; i++) {
			const ev = mkEvent('/api/version', { ip: '9.9.9.9' })
			last = ((await (handle as any)({ event: ev, resolve: async () => new Response('ok') })) as Response).status
		}
		expect(last).toBe(429)
	})
	it('un utilisateur autorisé fait 2 000 requêtes sans jamais être bloqué', async () => {
		state.logtoUser = { sub: 'a', email: 'chetana.yin@gmail.com', name: 'Chet' }
		const { handle } = await import('../../hooks.server')
		let blocked = 0
		for (let i = 0; i < 2000; i++) {
			const ev = mkEvent('/api/coffre/og-image', { ip: '3.3.3.3', cookie: true })
			const r = (await (handle as any)({ event: ev, resolve: async () => new Response('ok') })) as Response
			if (r.status === 429) blocked++
		}
		expect(blocked).toBe(0)
	})
	it('un cookie sans session valide ne donne aucune exemption', async () => {
		const { handle } = await import('../../hooks.server')
		let last = 200
		for (let i = 0; i < 121; i++) {
			const ev = mkEvent('/api/coffre/og-image', { ip: '4.4.4.4', cookie: true })
			last = ((await (handle as any)({ event: ev, resolve: async () => new Response('ok') })) as Response).status
		}
		expect(last).toBe(429)
	})
	it('un compte connecté mais refusé est limité comme un anonyme sur les chemins exemptés', async () => {
		state.logtoUser = { sub: 'z', email: 'pirate@gmail.com', name: 'P' }
		const { handle } = await import('../../hooks.server')
		let last = 200
		for (let i = 0; i < 121; i++) {
			const ev = mkEvent('/api/version', { ip: '5.5.5.5', cookie: true })
			last = ((await (handle as any)({ event: ev, resolve: async () => new Response('ok') })) as Response).status
		}
		expect(last).toBe(429)
	})
})
