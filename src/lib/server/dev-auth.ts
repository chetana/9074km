import type { Handle } from '@sveltejs/kit'

// Bypass d'authentification RÉSERVÉ aux tests e2e en développement : E2E_AUTH_USER injecte locals.dbUser
// sans passer par Logto. Triple garde : mode dev SvelteKit, NODE_ENV différent de « production », et la
// variable explicitement définie. En production (build, Docker, chetbox) aucune de ces conditions n'est
// réunie : la variable est ignorée, le 401 d'origine est conservé. Voir e2e/README.md.
export interface DevAuthEnv {
	dev: boolean
	nodeEnv: string | undefined
	raw: string | undefined
}

type DbUser = NonNullable<App.Locals['dbUser']>

const INT_MAX = 2147483647

/** Utilisateur de test issu de E2E_AUTH_USER (JSON `{id,email,name,picture}` ou simple nom), sinon null. */
export function resolveDevAuthUser(e: DevAuthEnv): DbUser | null {
	if (e.dev !== true || e.nodeEnv === 'production') return null
	const raw = e.raw?.trim()
	if (!raw) return null
	if (raw.startsWith('{')) {
		try {
			const o = JSON.parse(raw)
			if (!o || typeof o !== 'object' || Array.isArray(o)) return null
			const id = o.id === undefined ? 1 : o.id
			if (!Number.isInteger(id) || id < 1 || id > INT_MAX) return null
			const str = (v: unknown, d: string) => (typeof v === 'string' && v.length <= 200 ? v : d)
			return { id, email: str(o.email, 'e2e@example.test'), name: str(o.name, 'E2E'), picture: str(o.picture, '') }
		} catch {
			return null
		}
	}
	return raw.length <= 80 ? { id: 1, email: 'e2e@example.test', name: raw, picture: '' } : null
}

/** Handle SvelteKit : n'injecte QUE si aucune vraie session n'existe déjà (la vraie session gagne toujours). */
export function createDevAuthHandle(getEnv: () => DevAuthEnv): Handle {
	return ({ event, resolve }) => {
		if (!event.locals.dbUser) {
			const u = resolveDevAuthUser(getEnv())
			if (u) event.locals.dbUser = u
		}
		return resolve(event)
	}
}
