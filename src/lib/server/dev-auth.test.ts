import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { resolveDevAuthUser, createDevAuthHandle } from './dev-auth'
import { requireAuth } from './auth'

const DEVENV = { dev: true, nodeEnv: 'development' }

describe('resolveDevAuthUser : jamais en production', () => {
	it('production : ignorée, quelle que soit la valeur (JSON, nom, mode dev à true par erreur)', () => {
		for (const raw of ['Chet', '{"id":2,"name":"Chet"}', '  Lys  ']) {
			expect(resolveDevAuthUser({ dev: false, nodeEnv: 'production', raw })).toBeNull()
			expect(resolveDevAuthUser({ dev: true, nodeEnv: 'production', raw })).toBeNull() // NODE_ENV=production suffit à la couper
			expect(resolveDevAuthUser({ dev: false, nodeEnv: 'development', raw })).toBeNull() // build (dev=false) même avec NODE_ENV étrange
		}
	})
	it('garde positif : seul (dev true, NODE_ENV exactement « development ») active le bypass', () => {
		const raw = '{"id":4,"name":"Valide"}'
		expect(resolveDevAuthUser({ dev: true, nodeEnv: undefined, raw })).toBeNull()
		expect(resolveDevAuthUser({ dev: true, nodeEnv: 'production', raw })).toBeNull()
		expect(resolveDevAuthUser({ dev: true, nodeEnv: 'Production', raw })).toBeNull()
		expect(resolveDevAuthUser({ dev: true, nodeEnv: 'test', raw })).toBeNull()
		expect(resolveDevAuthUser({ dev: true, nodeEnv: 'Development', raw })).toBeNull()
		expect(resolveDevAuthUser({ dev: true, nodeEnv: '', raw })).toBeNull()
		expect(resolveDevAuthUser({ dev: false, nodeEnv: 'development', raw })).toBeNull()
		expect(resolveDevAuthUser({ dev: true, nodeEnv: 'development', raw })).toMatchObject({ id: 4, name: 'Valide' })
	})
	it('variable absente ou vide : rien', () => {
		for (const raw of [undefined, '', '   ']) expect(resolveDevAuthUser({ ...DEVENV, raw })).toBeNull()
	})
	it('dev + variable : utilisateur de test (nom seul, ou JSON complet)', () => {
		expect(resolveDevAuthUser({ ...DEVENV, raw: 'Chet E2E' })).toEqual({ id: 1, email: 'e2e@example.test', name: 'Chet E2E', picture: '' })
		expect(resolveDevAuthUser({ ...DEVENV, raw: '{"id":7,"email":"l@x.test","name":"Lys","picture":"p"}' })).toEqual({ id: 7, email: 'l@x.test', name: 'Lys', picture: 'p' })
	})
	it('JSON invalide, id hors bornes, types faux, nom démesuré : null (jamais d\'exception)', () => {
		for (const raw of ['{pas du json', '{"id":0}', '{"id":-3}', '{"id":1.5}', '{"id":"2"}', '{"id":99999999999}', 'x'.repeat(81)]) {
			expect(() => resolveDevAuthUser({ ...DEVENV, raw }), raw).not.toThrow()
			expect(resolveDevAuthUser({ ...DEVENV, raw }), raw).toBeNull()
		}
		expect(resolveDevAuthUser({ ...DEVENV, raw: '{"name":42}' })).toMatchObject({ name: 'E2E' }) // champ mal typé : valeur par défaut
	})
})

describe('createDevAuthHandle : session injectée seulement en dev', () => {
	const run = async (env: { dev: boolean; nodeEnv: string | undefined; raw: string | undefined }, dbUser?: any) => {
		const locals: any = dbUser ? { dbUser } : {}
		const handle = createDevAuthHandle(() => env)
		await handle({ event: { locals } as any, resolve: async () => new Response('ok') })
		return locals
	}
	it('dev + variable : locals.dbUser posé', async () => {
		expect((await run({ ...DEVENV, raw: 'Chet' })).dbUser).toMatchObject({ name: 'Chet' })
	})
	it('production + variable : AUCUNE session injectée et requireAuth garde son 401', async () => {
		const locals = await run({ dev: true, nodeEnv: 'production', raw: 'Chet' })
		expect(locals.dbUser).toBeUndefined()
		await expect(requireAuth({ locals } as any)).rejects.toMatchObject({ status: 401 })
	})
	it('dev + variable : requireAuth passe ; sans variable : 401', async () => {
		await expect(requireAuth({ locals: await run({ ...DEVENV, raw: 'Chet' }) } as any)).resolves.toMatchObject({ id: 1 })
		await expect(requireAuth({ locals: await run({ ...DEVENV, raw: undefined }) } as any)).rejects.toMatchObject({ status: 401 })
	})
	it('une vraie session existante n\'est jamais écrasée', async () => {
		const real = { id: 42, email: 'vrai@x.fr', name: 'Vrai', picture: '' }
		expect((await run({ ...DEVENV, raw: 'Chet' }, real)).dbUser).toBe(real)
	})
})

// --- Le VRAI hooks.server.ts monté avec NODE_ENV=production et E2E_AUTH_USER défini ---
const state = vi.hoisted(() => ({ dev: true, env: {} as Record<string, string> }))
vi.mock('$env/dynamic/private', () => ({ env: new Proxy({}, { get: (_t, k: string) => state.env[k] }) }))
vi.mock('$app/environment', () => ({ get dev() { return state.dev } }))
vi.mock('@logto/sveltekit', () => ({ handleLogto: () => ({ event, resolve }: any) => resolve(event), UserScope: { Email: 'email', Profile: 'profile' } }))
vi.mock('@sveltejs/kit/hooks', () => ({ sequence: (...hs: any[]) => async ({ event, resolve }: any) => { const run = (i: number, ev: any): any => (i === hs.length ? resolve(ev) : hs[i]({ event: ev, resolve: (e: any) => run(i + 1, e) })); return run(0, event) } }))
vi.mock('$lib/server/db', () => ({ getDB: () => { throw new Error('la base ne doit pas être touchée') } }))

describe('hooks.server.ts réel', () => {
	beforeEach(() => { vi.resetModules() })
	afterEach(() => { vi.unstubAllEnvs() })
	const mount = async () => {
		const { handle } = await import('../../hooks.server')
		const locals: any = {}
		const event = { request: new Request('http://t/api/coffre/events/for-date?d=bad'), url: new URL('http://t/api/coffre/events/for-date?d=bad'), cookies: { get: () => undefined }, locals } as any
		await handle({ event, resolve: async () => new Response('ok') })
		return locals
	}
	it('NODE_ENV=production + E2E_AUTH_USER défini : aucune session, 401 conservé', async () => {
		vi.stubEnv('NODE_ENV', 'production')
		state.dev = false
		state.env = { E2E_AUTH_USER: 'Chet', LOGTO_ENDPOINT: 'x', LOGTO_APP_ID: 'x', LOGTO_APP_SECRET: 'x', LOGTO_COOKIE_ENCRYPTION_KEY: 'x' }
		const locals = await mount()
		expect(locals.dbUser).toBeUndefined()
		await expect(requireAuth({ locals } as any)).rejects.toMatchObject({ status: 401 })
	})
	it('même cas avec le mode dev SvelteKit à true par erreur : NODE_ENV=production coupe quand même', async () => {
		vi.stubEnv('NODE_ENV', 'production')
		state.dev = true
		state.env = { E2E_AUTH_USER: 'Chet' }
		expect((await mount()).dbUser).toBeUndefined()
	})
	it('NODE_ENV absent (cas du Dockerfile d\'avant) : jamais de session même avec dev true', async () => {
		vi.stubEnv('NODE_ENV', undefined as any)
		delete process.env.NODE_ENV
		state.dev = true
		state.env = { E2E_AUTH_USER: 'Pirate' }
		expect((await mount()).dbUser).toBeUndefined()
	})
	it('build de production (dev réel du module = false) : aucune session même si NODE_ENV=development est posé', async () => {
		vi.stubEnv('NODE_ENV', 'development')
		state.dev = false
		state.env = { E2E_AUTH_USER: 'Pirate' }
		expect((await mount()).dbUser).toBeUndefined()
	})
	it('développement + variable : la session de test est injectée (ce que les specs e2e utilisent)', async () => {
		vi.stubEnv('NODE_ENV', 'development')
		state.dev = true
		state.env = { E2E_AUTH_USER: '{"id":3,"name":"Lys E2E"}' }
		expect((await mount()).dbUser).toMatchObject({ id: 3, name: 'Lys E2E' })
	})
	it('développement sans variable : pas de session', async () => {
		vi.stubEnv('NODE_ENV', 'development')
		state.dev = true
		state.env = {}
		expect((await mount()).dbUser).toBeUndefined()
	})
})

describe('E2E_AUTH_USER n\'existe que côté serveur', () => {
	const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p] })
	it('référencée seulement dans hooks.server.ts, server/dev-auth.ts et leurs tests : jamais dans un fichier client', () => {
		const hits = walk(join(process.cwd(), 'src')).filter((p) => /\.(ts|js|svelte)$/.test(p) && !/\.test\.ts$/.test(p) && readFileSync(p, 'utf8').includes('E2E_AUTH_USER')).map((p) => p.replace(process.cwd() + '/', ''))
		expect(hits.sort()).toEqual(['src/hooks.server.ts', 'src/lib/server/dev-auth.ts'].sort())
	})
})
