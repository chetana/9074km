import { OAuth2Client } from 'google-auth-library'
import { error } from '@sveltejs/kit'
import { getDB } from './db'
import { users } from './schema'
import { eq } from 'drizzle-orm'

let _client: OAuth2Client | null = null

function getAuthClient(): OAuth2Client {
  if (!_client) {
    _client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)
  }
  return _client
}

export async function requireAuth(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    throw error(401, 'Missing authorization token')
  }

  const idToken = authHeader.slice(7)

  let payload: any
  try {
    const ticket = await getAuthClient().verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    })
    payload = ticket.getPayload()
  } catch {
    throw error(401, 'Invalid or expired token')
  }

  if (!payload?.email || !payload?.sub) {
    throw error(401, 'Invalid token payload')
  }

  const db = getDB()

  const existing = await db.select().from(users).where(eq(users.googleId, payload.sub))
  if (existing.length > 0) {
    await db.update(users)
      .set({ lastLoginAt: new Date(), name: payload.name ?? existing[0].name, picture: payload.picture ?? existing[0].picture, email: payload.email })
      .where(eq(users.id, existing[0].id))
    return { id: existing[0].id, email: payload.email as string, name: payload.name as string, picture: payload.picture as string }
  }

  const byEmail = await db.select().from(users).where(eq(users.email, payload.email))
  if (byEmail.length > 0) {
    await db.update(users)
      .set({ googleId: payload.sub, lastLoginAt: new Date(), name: payload.name ?? byEmail[0].name, picture: payload.picture ?? byEmail[0].picture })
      .where(eq(users.id, byEmail[0].id))
    return { id: byEmail[0].id, email: payload.email as string, name: payload.name as string, picture: payload.picture as string }
  }

  const [newUser] = await db.insert(users).values({
    email: payload.email,
    name: payload.name,
    picture: payload.picture,
    googleId: payload.sub,
  }).returning()

  return { id: newUser.id, email: payload.email as string, name: payload.name as string, picture: payload.picture as string }
}
