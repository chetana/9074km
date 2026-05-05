import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireAuth } from '$lib/server/auth'
import { upsertSubscription } from '$lib/server/push'

export const POST: RequestHandler = async (event) => {
  const user = await requireAuth(event)
  const body = await event.request.json()

  const { endpoint, keys, author } = body
  if (!endpoint || !keys?.p256dh || !keys?.auth || !author) {
    throw error(400, 'endpoint, keys et author sont requis')
  }

  await upsertSubscription({ endpoint, keys, author, updatedAt: new Date().toISOString() })
  return json({ ok: true })
}
