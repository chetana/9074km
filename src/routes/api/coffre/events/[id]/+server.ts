import { error, json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireAuth } from '$lib/server/auth'
import { ensureCoffreSchema } from '$lib/server/coffre-db'
import { patchEvent, softDeleteEvent, type PatchColumns } from '$lib/server/events-store'
import { parsePatchEvent, parseEventId, detectNameLang, todayInParis } from '$lib/server/events-validate'
import { scheduleNameTranslation } from '$lib/server/events-names'

export const PATCH: RequestHandler = async (event) => {
  const user = await requireAuth(event)
  const id = parseEventId(event.params.id)
  if (id === null) throw error(400, 'invalid id')
  let body: unknown
  try { body = await event.request.json() } catch { throw error(400, 'invalid JSON') }
  const parsed = parsePatchEvent(body)
  if (!parsed.ok) throw error(400, parsed.error)
  const p = parsed.value

  const cols: PatchColumns = {}
  let translate: { lang: 'fr' | 'en' | 'kh'; text: string } | null = null
  if (p.name !== undefined) {
    const lang = p.nameLang ?? detectNameLang(p.name)
    cols.names = { fr: p.name, en: p.name, kh: p.name }
    cols.srcLang = lang
    cols.namesPending = true
    translate = { lang, text: p.name }
  } else if (p.names) {
    cols.names = p.names
    cols.namesPending = false
  }

  await ensureCoffreSchema()
  const out = await patchEvent(id, p, cols, todayInParis())
  if (out.kind === 'not_found') throw error(404, 'event not found')
  if (out.kind === 'invalid') throw error(400, out.message)
  event.setHeaders({ 'cache-control': 'no-store' })
  if (out.kind === 'conflict') return json({ current: out.current }, { status: 409 })
  // translation : « scheduled » (lancée en arrière-plan) ou « limited » (plafond atteint : le nom source reste, names_pending)
  const translation = translate ? (scheduleNameTranslation(user.id, id, translate.lang, translate.text) ? 'scheduled' : 'limited') : undefined
  return json({ event: out.event, translation })
}

export const DELETE: RequestHandler = async (event) => {
  await requireAuth(event)
  const id = parseEventId(event.params.id)
  if (id === null) throw error(400, 'invalid id')
  await ensureCoffreSchema()
  if (!(await softDeleteEvent(id))) throw error(404, 'event not found')
  return json({ success: true })
}
