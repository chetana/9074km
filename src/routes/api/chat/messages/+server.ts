import { error, json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireAuth } from '$lib/server/auth'
import { getGcsBucket } from '$lib/server/gcs'
import { geminiTranslateAll } from '$lib/server/vertex'

interface ChatMessage {
  id: string; author: string; text: string; fr: string; en: string; kh: string
  lang?: string; ts: string; image?: string; source?: 'audio'
}

const NO_STORE = { 'Cache-Control': 'no-store, must-revalidate' }

export const GET: RequestHandler = async (event) => {
  const { request, url } = event
  await requireAuth(event)
  const y = url.searchParams.get('y') ?? ''
  const m = url.searchParams.get('m') ?? ''
  const d = url.searchParams.get('d') ?? ''
  if (!y || !m || !d) throw error(400, 'y, m, d are required')

  const bucket = getGcsBucket()
  try {
    const [contents] = await bucket.file(`chat/${y}/${m}/${d}.json`).download()
    return json(JSON.parse(contents.toString('utf-8')), { headers: NO_STORE })
  } catch (e: any) {
    if (e?.code === 404) return json([], { headers: NO_STORE })
    throw error(502, 'Failed to read messages')
  }
}

export const POST: RequestHandler = async (event) => {
  const { request, url } = event
  await requireAuth(event)
  const y = url.searchParams.get('y') ?? ''
  const m = url.searchParams.get('m') ?? ''
  const d = url.searchParams.get('d') ?? ''
  if (!y || !m || !d) throw error(400, 'y, m, d are required')

  const body = await request.json() as {
    author: string; text?: string; fr?: string; en?: string; kh?: string; lang?: string
    lessons?: { original: string; corrected: string; explanation: string }[]
    image?: string; source?: 'audio'
  }
  if (!body?.author || (!body?.text && !body?.image)) throw error(400, 'author and text or image are required')

  const text = body.text ?? ''
  let fr = body.fr ?? '', en = body.en ?? '', kh = body.kh ?? '', lang = body.lang ?? ''

  // Charger les messages existants d'abord pour avoir le contexte du dernier message
  const bucket = getGcsBucket()
  let messages: ChatMessage[] = []
  try {
    const [contents] = await bucket.file(`chat/${y}/${m}/${d}.json`).download()
    messages = JSON.parse(contents.toString('utf-8'))
  } catch (e: any) {
    if (e?.code !== 404) throw error(502, 'Failed to read messages')
  }

  if (text.trim().length >= 2 && (!fr || !en || !kh)) {
    const previousMessage = messages.length > 0 ? messages[messages.length - 1].text : undefined
    const t = await geminiTranslateAll(text, body.author, previousMessage).catch(() => ({ fr: '', en: '', kh: '', lang: '' }))
    if (!fr) fr = t.fr
    if (!en) en = t.en
    if (!kh) kh = t.kh
    if (!lang) lang = t.lang ?? ''
  }

  const newMessage: ChatMessage = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    author: body.author, text, fr, en, kh,
    ...(lang ? { lang } : {}),
    ts: new Date().toISOString(),
    ...(body.image ? { image: body.image } : {}),
    ...(body.source ? { source: body.source } : {}),
  }

  messages.push(newMessage)
  await bucket.file(`chat/${y}/${m}/${d}.json`).save(JSON.stringify(messages), { contentType: 'application/json' })

  if (body.lessons && body.lessons.length > 0) {
    try {
      const lessonsPath = 'chat/lessons.json'
      let stored: object[] = []
      try {
        const [lc] = await bucket.file(lessonsPath).download()
        stored = JSON.parse(lc.toString('utf-8'))
      } catch {}
      const now = Date.now()
      const entries = body.lessons.map((l, i) => ({
        id: `${now + i}-${Math.random().toString(36).slice(2, 7)}`,
        ts: newMessage.ts, author: body.author,
        original: l.original, corrected: l.corrected, lesson: l.explanation, lang: lang || 'fr',
      }))
      stored.unshift(...entries)
      await bucket.file(lessonsPath).save(JSON.stringify(stored), { contentType: 'application/json' })
    } catch {}
  }

  return json(newMessage)
}

export const DELETE: RequestHandler = async (event) => {
  const { request, url } = event
  const user = await requireAuth(event)
  const y = url.searchParams.get('y') ?? ''
  const m = url.searchParams.get('m') ?? ''
  const d = url.searchParams.get('d') ?? ''
  const id = url.searchParams.get('id') ?? ''
  if (!y || !m || !d || !id) throw error(400, 'y, m, d, id are required')

  const bucket = getGcsBucket()
  let messages: ChatMessage[] = []
  try {
    const [contents] = await bucket.file(`chat/${y}/${m}/${d}.json`).download()
    messages = JSON.parse(contents.toString('utf-8'))
  } catch (e: any) {
    if (e?.code === 404) throw error(404, 'No messages for this day')
    throw error(502, 'Failed to read messages')
  }

  const target = messages.find(msg => msg.id === id)
  if (!target) throw error(404, 'Message not found')

  const authorName = user.name?.split(' ')[0] ?? ''
  if (target.author !== authorName) throw error(403, "Cannot delete another user's message")

  const updated = messages.filter(msg => msg.id !== id)
  await bucket.file(`chat/${y}/${m}/${d}.json`).save(JSON.stringify(updated), { contentType: 'application/json' })
  return json({ ok: true })
}
