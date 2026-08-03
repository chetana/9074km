import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireAuth } from '$lib/server/auth'
import { getGcsBucket } from '$lib/server/gcs'

// { [messageId]: { [emoji]: string[] } }
type ReactionsMap = Record<string, Record<string, string[]>>

const ALLOWED = ['❤️', '😂', '😮', '😢', '👍', '🔥']

export const GET: RequestHandler = async (event) => {
  await requireAuth(event)
  const { url } = event
  const y = url.searchParams.get('y') ?? ''
  const m = url.searchParams.get('m') ?? ''
  const d = url.searchParams.get('d') ?? ''
  if (!y || !m || !d) throw error(400, 'y, m, d are required')

  const bucket = getGcsBucket()
  try {
    const [contents] = await bucket.file(`chat/${y}/${m}/${d}-reactions.json`).download()
    return json(JSON.parse(contents.toString('utf-8')))
  } catch (e: any) {
    if (e?.code === 404) return json({})
    throw error(502, 'Failed to read reactions')
  }
}

export const POST: RequestHandler = async (event) => {
  const user = await requireAuth(event)
  const { url } = event
  const y = url.searchParams.get('y') ?? ''
  const m = url.searchParams.get('m') ?? ''
  const d = url.searchParams.get('d') ?? ''
  if (!y || !m || !d) throw error(400, 'y, m, d are required')

  const body = await event.request.json() as { messageId: string; emoji: string }
  if (!body?.messageId || !body?.emoji) throw error(400, 'messageId et emoji requis')
  if (!ALLOWED.includes(body.emoji)) throw error(400, 'emoji non autorisé')

  const author = user.name?.split(' ')[0] ?? ''
  const bucket = getGcsBucket()
  const path = `chat/${y}/${m}/${d}-reactions.json`

  let reactions: ReactionsMap = {}
  try {
    const [contents] = await bucket.file(path).download()
    reactions = JSON.parse(contents.toString('utf-8'))
  } catch {}

  if (!reactions[body.messageId]) reactions[body.messageId] = {}
  const authors = reactions[body.messageId][body.emoji] ?? []
  const idx = authors.indexOf(author)
  // Toggle : retire si déjà là, ajoute sinon
  if (idx >= 0) authors.splice(idx, 1)
  else authors.push(author)
  reactions[body.messageId][body.emoji] = authors

  await bucket.file(path).save(JSON.stringify(reactions), { contentType: 'application/json' })

  return json({ ok: true, reactions: reactions[body.messageId] })
}
