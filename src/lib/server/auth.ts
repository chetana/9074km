import { error, type RequestEvent } from '@sveltejs/kit'

export interface AuthUser {
  id: number
  email: string
  name: string
  picture: string
}

/**
 * Guard for API routes: returns the authenticated DB user from `event.locals.dbUser`
 * (populated by `hooks.server.ts` via the Logto session cookie).
 *
 * Returns the same shape as before: `{ id, email, name, picture }`.
 * Downstream logic (isChet, `name.split(' ')[0]`, coupleContext) is unchanged.
 */
export async function requireAuth(event: RequestEvent): Promise<AuthUser> {
  const user = event.locals.dbUser
  if (!user) throw error(401, 'Unauthorized')
  return user
}
