import { error, json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireAuth } from '$lib/server/auth'
import { ensureCoffreSchema } from '$lib/server/coffre-db'
import { addEventMedia, listEventMedia, removeEventMedia } from '$lib/server/events-store'
import { parsePathsBody, parseEventId } from '$lib/server/events-validate'

async function readPaths(event: Parameters<RequestHandler>[0]): Promise<{ id: number; paths: string[]; mode: 'move' | 'keep' }> {
  const id = parseEventId(event.params.id)
  if (id === null) throw error(400, 'invalid id')
  let body: unknown
  try { body = await event.request.json() } catch { throw error(400, 'invalid JSON') }
  const parsed = parsePathsBody(body)
  if (!parsed.ok) throw error(400, parsed.error)
  return { id, paths: parsed.value.paths, mode: parsed.value.mode }
}

export const GET: RequestHandler = async (event) => {
  await requireAuth(event)
  const id = parseEventId(event.params.id)
  if (id === null) throw error(400, 'invalid id')
  await ensureCoffreSchema()
  const paths = await listEventMedia(id)
  if (paths === null) throw error(404, 'event not found')
  event.setHeaders({ 'cache-control': 'no-store' })
  return json({ paths })
}

export const POST: RequestHandler = async (event) => {
  const user = await requireAuth(event)
  const { id, paths, mode } = await readPaths(event)
  await ensureCoffreSchema()
  const res = await addEventMedia(id, user.id, paths, mode)
  if (!res) throw error(404, 'event not found')
  // skipped : photos déjà rangées dans un AUTRE évènement, laissées en place (mode keep)
  return json({ success: true, added: res.added.length, skipped: res.skipped })
}

export const DELETE: RequestHandler = async (event) => {
  await requireAuth(event)
  const { id, paths } = await readPaths(event)
  await ensureCoffreSchema()
  const removed = await removeEventMedia(id, paths)
  if (removed === null) throw error(404, 'event not found')
  return json({ success: true, removed })
}
