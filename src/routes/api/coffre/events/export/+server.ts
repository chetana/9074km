import { error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireAuth } from '$lib/server/auth'
import { ensureCoffreSchema } from '$lib/server/coffre-db'
import { exportEvents } from '$lib/server/events-store'
import { exportLimiter } from '$lib/server/events-limits'
import { todayInParis } from '$lib/server/events-validate'

// Export JSON téléchargeable : évènements + chemins de photos. Sans GPS, sans uploader, sans identifiant d'utilisateur.
export const GET: RequestHandler = async (event) => {
  const user = await requireAuth(event)
  if (!exportLimiter.take(user.id)) throw error(429, 'too many exports')
  let events: Awaited<ReturnType<typeof exportEvents>>
  try {
    await ensureCoffreSchema()
    events = await exportEvents()
  } catch (e) {
    // Échec de notre côté : 503 propre, et le quota n'est PAS décompté.
    exportLimiter.refund(user.id)
    console.error('[coffre/events/export]', (e as Error)?.message)
    throw error(503, 'export indisponible')
  }
  const today = todayInParis()
  return new Response(JSON.stringify({ format: 'coffre-evenements', formatVersion: 1, exportedAt: new Date().toISOString(), count: events.length, events }, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="evenements-coffre-${today}.json"`,
      'cache-control': 'no-store',
    },
  })
}
