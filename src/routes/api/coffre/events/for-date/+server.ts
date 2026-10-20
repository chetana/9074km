import { error, json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireAuth } from '$lib/server/auth'
import { ensureCoffreSchema } from '$lib/server/coffre-db'
import { eventsForDate } from '$lib/server/events-store'
import { isValidDate, todayInParis } from '$lib/server/events-validate'

// events = évènements couvrant la date (auto_attach d'abord) ; tags = évènement de chaque photo du jour.
export const GET: RequestHandler = async (event) => {
  await requireAuth(event)
  const d = event.url.searchParams.get('d')
  if (!isValidDate(d)) throw error(400, 'invalid date')
  await ensureCoffreSchema()
  const res = await eventsForDate(d, todayInParis())
  event.setHeaders({ 'cache-control': 'no-store' })
  return json(res)
}
