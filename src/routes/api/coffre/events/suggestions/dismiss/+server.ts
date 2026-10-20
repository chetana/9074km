import { error, json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireAuth } from '$lib/server/auth'
import { ensureCoffreSchema } from '$lib/server/coffre-db'
import { addDismissal } from '$lib/server/media-store'
import { parseDismissBody } from '$lib/server/events-validate'

// Refus partagé entre Chet et Lys : la suggestion revient si la plage grossit d'au moins 50 %.
export const POST: RequestHandler = async (event) => {
  const user = await requireAuth(event)
  let body: unknown
  try { body = await event.request.json() } catch { throw error(400, 'invalid JSON') }
  const parsed = parseDismissBody(body)
  if (!parsed.ok) throw error(400, parsed.error)
  try {
    await ensureCoffreSchema()
    await addDismissal(user.id, parsed.value.start, parsed.value.end, parsed.value.count)
    return json({ success: true })
  } catch (e) {
    console.error('[coffre/events/suggestions/dismiss]', (e as Error)?.message)
    throw error(503, 'refus non enregistré')
  }
}
