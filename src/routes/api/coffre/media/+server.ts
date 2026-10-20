import { error, json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireAuth } from '$lib/server/auth'
import { ensureCoffreSchema } from '$lib/server/coffre-db'
import { recordMedia } from '$lib/server/media-store'
import { parseMediaBatch } from '$lib/server/events-validate'

// Appelée APRÈS un upload réussi, avec les chemins réellement envoyés + EXIF lu côté client.
// Best-effort : le client ignore l'échec, et un souci Postgres ne remonte jamais comme une erreur d'upload.
export const POST: RequestHandler = async (event) => {
  const user = await requireAuth(event)
  let body: unknown
  try { body = await event.request.json() } catch { throw error(400, 'invalid JSON') }
  const parsed = parseMediaBatch(body)
  if (!parsed.ok) throw error(400, parsed.error)
  try {
    await ensureCoffreSchema()
    const recorded = await recordMedia(user.name || null, parsed.value)
    return json({ ok: true, recorded })
  } catch (e) {
    console.error('[coffre/media] enregistrement échoué:', (e as Error)?.message)
    return json({ ok: false }, { status: 503 })
  }
}
