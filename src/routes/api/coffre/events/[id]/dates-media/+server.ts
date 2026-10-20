import { error, json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireAuth } from '$lib/server/auth'
import { ensureCoffreSchema } from '$lib/server/coffre-db'
import { attachUnattachedInRange, countUnattachedInRange } from '$lib/server/events-store'
import { parseEventId } from '$lib/server/events-validate'

// « Ajouter les photos de ces dates » : photos du coffre dans les dates de l'évènement qui n'ont AUCUN évènement.
// GET = compteur (calculé ici, jamais par le client) ; POST = rattachement atomique, jamais de déplacement.
export const GET: RequestHandler = async (event) => {
  await requireAuth(event)
  const id = parseEventId(event.params.id)
  if (id === null) throw error(400, 'invalid id')
  await ensureCoffreSchema()
  const count = await countUnattachedInRange(id)
  if (count === null) throw error(404, 'event not found')
  event.setHeaders({ 'cache-control': 'no-store' })
  return json({ count })
}

export const POST: RequestHandler = async (event) => {
  const user = await requireAuth(event)
  const id = parseEventId(event.params.id)
  if (id === null) throw error(400, 'invalid id')
  await ensureCoffreSchema()
  const res = await attachUnattachedInRange(id, user.id)
  if (!res) throw error(404, 'event not found')
  return json({ success: true, added: res.added })
}
