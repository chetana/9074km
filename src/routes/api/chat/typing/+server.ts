import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireAuth } from '$lib/server/auth'
import { broadcast } from '$lib/server/sse'

export const POST: RequestHandler = async (event) => {
  const user = await requireAuth(event)
  const { url } = event
  const y = url.searchParams.get('y') ?? ''
  const m = url.searchParams.get('m') ?? ''
  const d = url.searchParams.get('d') ?? ''
  if (!y || !m || !d) throw error(400, 'y, m, d are required')

  const author = user.name?.split(' ')[0] ?? ''
  broadcast(`${y}/${m}/${d}`, { type: 'typing', author })
  return json({ ok: true })
}
