import { error, json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireAuth } from '$lib/server/auth'
import { ensureCoffreSchema } from '$lib/server/coffre-db'
import { skipMedia } from '$lib/server/media-store'
import { parseSkipBody } from '$lib/server/events-validate'

// « Passer » dans le mode tri : skipped_at posé (la photo ne revient pas avant 30 jours). undo = annulation du dernier geste.
export const POST: RequestHandler = async (event) => {
  await requireAuth(event)
  let body: unknown
  try { body = await event.request.json() } catch { throw error(400, 'invalid JSON') }
  const parsed = parseSkipBody(body)
  if (!parsed.ok) throw error(400, parsed.error)
  try {
    await ensureCoffreSchema()
    return json({ success: true, updated: await skipMedia(parsed.value.paths, parsed.value.undo) })
  } catch (e) {
    console.error('[coffre/media/skip]', (e as Error)?.message)
    throw error(503, 'index indisponible')
  }
}
