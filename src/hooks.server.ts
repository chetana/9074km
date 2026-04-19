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

const logto = handleLogto(
	{
		endpoint: env.LOGTO_ENDPOINT!,
		appId: env.LOGTO_APP_ID!,
		appSecret: env.LOGTO_APP_SECRET!,
		scopes: [UserScope.Email, UserScope.Profile],
	},
	{ encryptionKey: env.LOGTO_COOKIE_ENCRYPTION_KEY! },
	{ fetchUserInfo: true },
)

const dbUser: Handle = async ({ event, resolve }) => {
	if (event.locals.user) {
		const userInfo = event.locals.user
		const logtoId = userInfo.sub
		const email = userInfo.email
		const name = userInfo.name ?? ''
		const picture = userInfo.picture ?? ''

		if (logtoId && email) {
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

			if (dbRow) {
				event.locals.dbUser = {
					id: dbRow.id,
					email,
					name: name || dbRow.name || '',
					picture: picture || dbRow.picture || '',
				}
			}
		}
	}

	return resolve(event)
}

export const handle = sequence(clearStaleCookie, logto, dbUser)
