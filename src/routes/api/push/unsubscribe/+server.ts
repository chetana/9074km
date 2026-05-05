import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireAuth } from '$lib/server/auth'
import { removeSubscription } from '$lib/server/push'

export const POST: RequestHandler = async (event) => {
  await requireAuth(event)
  const body = await event.request.json()
  if (!body?.endpoint) throw error(400, 'endpoint requis')
  await removeSubscription(body.endpoint)
  return json({ ok: true })
}
