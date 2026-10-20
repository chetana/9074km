import { error, json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireAuth } from '$lib/server/auth'
import { ensureCoffreSchema } from '$lib/server/coffre-db'
import { createEvent, listEvents } from '$lib/server/events-store'
import { parseCreateEvent, detectNameLang, todayInParis, cleanLine, PLACE_MAX } from '$lib/server/events-validate'
import { eventCreateLimiter } from '$lib/server/events-limits'
import { scheduleNameTranslation, healPendingNames } from '$lib/server/events-names'

export const GET: RequestHandler = async (event) => {
  const user = await requireAuth(event)
  const year = event.url.searchParams.get('year') ?? undefined
  if (year !== undefined && !/^\d{4}$/.test(year)) throw error(400, 'invalid year')
  const rawPlace = event.url.searchParams.get('place')
  const place = rawPlace === null ? undefined : cleanLine(rawPlace)
  if (place === null || (place !== undefined && Array.from(place).length > PLACE_MAX)) throw error(400, 'invalid place')
  await ensureCoffreSchema()
  const events = await listEvents({ year, place: place || undefined, today: todayInParis() })
  healPendingNames(user.id, events)
  event.setHeaders({ 'cache-control': 'no-store' })
  return json({ events })
}

export const POST: RequestHandler = async (event) => {
  const user = await requireAuth(event)
  let body: unknown
  try { body = await event.request.json() } catch { throw error(400, 'invalid JSON') }
  const parsed = parseCreateEvent(body)
  if (!parsed.ok) throw error(400, parsed.error)
  if (!eventCreateLimiter.take(user.id)) throw error(429, 'too many events created')
  const input = parsed.value
  const srcLang = input.nameLang ?? detectNameLang(input.name)

  await ensureCoffreSchema()
  // Nom source dans les 3 langues en attendant la traduction (ou si le plafond est atteint).
  const created = await createEvent(
    user.id, input, { fr: input.name, en: input.name, kh: input.name, srcLang, pending: true }, todayInParis()
  )
  const translation = scheduleNameTranslation(user.id, created.id, srcLang, input.name) ? 'scheduled' : 'limited'
  event.setHeaders({ 'cache-control': 'no-store' })
  return json({ event: created, translation }, { status: 201 })
}
