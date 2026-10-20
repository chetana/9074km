import { error, json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireAuth } from '$lib/server/auth'
import { ensureCoffreSchema } from '$lib/server/coffre-db'
import { countUnclassified, listUnclassified } from '$lib/server/media-store'
import { parseUnclassifiedQuery, encodeCursor } from '$lib/server/events-validate'

// Photos/vidéos indexées sans évènement (hors supprimées et ignorées), jour décroissant.
export const GET: RequestHandler = async (event) => {
  await requireAuth(event)
  const q = parseUnclassifiedQuery(event.url.searchParams)
  if (!q.ok) throw error(400, q.error)
  try {
    await ensureCoffreSchema()
    const [total, rows] = await Promise.all([countUnclassified(), listUnclassified(q.value.limit + 1, q.value.cursor)])
    const items = rows.slice(0, q.value.limit)
    const last = items[items.length - 1]
    event.setHeaders({ 'cache-control': 'no-store' })
    return json({ total, items, nextCursor: rows.length > q.value.limit && last ? encodeCursor(last.day, last.path) : null })
  } catch (e) {
    console.error('[coffre/media/unclassified]', (e as Error)?.message)
    throw error(503, 'index indisponible')
  }
}
