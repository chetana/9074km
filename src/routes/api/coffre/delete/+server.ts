import { error, json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireAuth } from '$lib/server/auth'
import { getGcsBucket } from '$lib/server/gcs'
import { isValidCoffrePath } from '$lib/server/coffre-path'
import { ensureCoffreSchema } from '$lib/server/coffre-db'
import { forgetMediaPath } from '$lib/server/events-store'
import { markMediaDeleted } from '$lib/server/media-store'

const CLEANUP_TIMEOUT_MS = 3000

// Nettoyage best-effort : un échec ou une lenteur de Postgres ne doit jamais faire échouer la suppression S3.
async function detachFromEvents(path: string): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      (async () => { await ensureCoffreSchema(); await forgetMediaPath(path); await markMediaDeleted(path) })(),
      new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('timeout')), CLEANUP_TIMEOUT_MS) }),
    ])
  } catch (e) {
    console.error('[coffre/delete] nettoyage event_media échoué:', (e as Error)?.message)
  } finally {
    clearTimeout(timer)
  }
}

export const DELETE: RequestHandler = async (event) => {
  const { request, url } = event
  await requireAuth(event)
  const path = url.searchParams.get('path')
  if (!path) throw error(400, 'path is required')
  if (!isValidCoffrePath(path)) throw error(400, 'invalid path')
  await getGcsBucket().file(path).delete()
  await detachFromEvents(path)
  return json({ success: true })
}
