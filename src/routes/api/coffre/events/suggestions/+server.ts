import { error, json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireAuth } from '$lib/server/auth'
import { ensureCoffreSchema } from '$lib/server/coffre-db'
import { liveEventRanges } from '$lib/server/events-store'
import { listUnclassifiedForSuggestions, listDismissals } from '$lib/server/media-store'
import { suggestEvents } from '$lib/server/event-suggest'

// Au plus 3 suggestions calculées sur les photos « à classer » ; jour-dossier = date du chemin, jamais uploaded_at.
export const GET: RequestHandler = async (event) => {
  await requireAuth(event)
  try {
    await ensureCoffreSchema()
    const [media, events, dismissals] = await Promise.all([listUnclassifiedForSuggestions(), liveEventRanges(), listDismissals()])
    event.setHeaders({ 'cache-control': 'no-store' })
    return json({ suggestions: suggestEvents({ media, events, dismissals }) })
  } catch (e) {
    console.error('[coffre/events/suggestions]', (e as Error)?.message)
    throw error(503, 'suggestions indisponibles')
  }
}
