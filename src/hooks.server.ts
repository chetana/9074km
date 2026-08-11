import { handleLogto, UserScope } from '@logto/sveltekit'
import { env } from '$env/dynamic/private'
import { eq } from 'drizzle-orm'
import { sequence } from '@sveltejs/kit/hooks'
import type { Handle } from '@sveltejs/kit'
import { getDB } from '$lib/server/db'
import { users } from '$lib/server/schema'

const LOGTO_COOKIE = 'logtoCookies'

// Quand un cookie est stale (encryption key ayant changé, token expiré non-refreshable...),
// on le nettoie avant que handleLogto ne tente de le lire.
const clearStaleCookie: Handle = async ({ event, resolve }) => {
	const response = await resolve(event)
	if (response.status === 500) {
		const text = await response.clone().text().catch(() => '')
		if (text.includes('invalid_token') || text.includes('Invalid token')) {
			// Renvoie une réponse 200 vide qui clear le cookie — évite la boucle de redirect
			return new Response(
				'<html><body><script>location.href="/"</script></body></html>',
				{
					status: 200,
					headers: {
						'Content-Type': 'text/html',
						'Set-Cookie': `${LOGTO_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`,
					},
				}
			)
		}
	}
	return response
}

const logtoHandler = handleLogto(
	{
		endpoint: env.LOGTO_ENDPOINT!,
		appId: env.LOGTO_APP_ID!,
		appSecret: env.LOGTO_APP_SECRET!,
		scopes: [UserScope.Email, UserScope.Profile],
	},
	{ encryptionKey: env.LOGTO_COOKIE_ENCRYPTION_KEY! },
	// fetchUserInfo: false (défaut) — les claims sub/email/name/picture viennent du JWT local
	// Évite un appel réseau à logto-core sur chaque requête (cold start en cascade)
)

// AI-DEV: Fast-path cold start — skip Logto si pas de cookie de session.
// Sans cette guard, chaque requête sans cookie appelait logto-core → +3-5s au cold start.
// Ne pas retirer ce check : logto-core est un service séparé sur Cloud Run,
// l'appeler systématiquement recréerait la cascade cold start (lys → logto-core → Supabase).
// EXCEPTION : /api/auth/ doit toujours passer par logto (locals.logtoClient requis pour signIn/callback/sign-out).
const logto: Handle = ({ event, resolve }) => {
	if (!event.cookies.get(LOGTO_COOKIE) && !event.url.pathname.startsWith('/api/auth/')) {
		return resolve(event)
	}
	return logtoHandler({ event, resolve })
}

// AI-DEV: Cache mémoire du mapping logtoId → user (id/name/picture stable, jamais changeant).
// AVANT : chaque requête faisait SELECT + UPDATE users (lastLoginAt=now()). Le chat poll toutes
// les 8s → 1 write/8s sur la Serverless SQL chetana-portfolio → base maintenue chaude 24/7 dès
// qu'un onglet est ouvert. La table users n'a que 2-3 lignes : pas d'éviction nécessaire.
// APRÈS : cache-hit < 1h = ZÉRO accès DB (le poll ne réveille plus la base). L'écriture de
// lastLoginAt est throttlée à 1×/h. Cache perdu au cold-start → 1 upsert au 1er accès (négligeable).
const userCache = new Map<string, { id: number; name: string; picture: string; lastWriteMs: number }>()
const WRITE_THROTTLE_MS = 60 * 60 * 1000 // 1 h

const dbUser: Handle = async ({ event, resolve }) => {
	if (event.locals.user) {
		const userInfo = event.locals.user
		const logtoId = userInfo.sub
		const email = userInfo.email
		const name = userInfo.name ?? ''
		const picture = userInfo.picture ?? ''

		if (logtoId && email) {
			const now = Date.now()
			let cached = userCache.get(logtoId)

			if (!cached) {
				// Cache-miss (cold-start ou 1er accès) : un seul aller-retour DB, puis on mémorise.
				const db = getDB()
				let dbRow = (await db.select().from(users).where(eq(users.logtoId, logtoId)))[0]
				if (dbRow) {
					await db.update(users)
						.set({ lastLoginAt: new Date(), name: name || dbRow.name, picture: picture || dbRow.picture, email })
						.where(eq(users.id, dbRow.id))
				} else {
					dbRow = (await db.select().from(users).where(eq(users.email, email)))[0]
					if (dbRow) {
						await db.update(users)
							.set({ logtoId, lastLoginAt: new Date(), name: name || dbRow.name, picture: picture || dbRow.picture })
							.where(eq(users.id, dbRow.id))
					} else {
						const inserted = await db.insert(users).values({ email, name, picture, logtoId }).returning()
						dbRow = inserted[0]
					}
				}
				cached = { id: dbRow.id, name: dbRow.name ?? '', picture: dbRow.picture ?? '', lastWriteMs: now }
				userCache.set(logtoId, cached)
			} else if (now - cached.lastWriteMs > WRITE_THROTTLE_MS) {
				// Cache-hit mais lastLoginAt périmé (>1h) : une seule écriture throttlée.
				cached.lastWriteMs = now
				const db = getDB()
				await db.update(users)
					.set({ lastLoginAt: new Date(), name: name || cached.name, picture: picture || cached.picture, email })
					.where(eq(users.id, cached.id))
			}
			// Sinon (cache-hit, <1h) : AUCUN accès DB — le poll 8s ne réveille plus la base.

			event.locals.dbUser = {
				id: cached.id,
				email,
				name: name || cached.name || '',
				picture: picture || cached.picture || '',
			}
		}
	}

	return resolve(event)
}

export const handle = sequence(clearStaleCookie, logto, dbUser)
