import { error, json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireAuth } from '$lib/server/auth'
import { getGcsBucket } from '$lib/server/gcs'

export const GET: RequestHandler = async (event) => {
  const { request, url } = event
  await requireAuth(event)
  const y = url.searchParams.get('y') ?? '', m = url.searchParams.get('m') ?? '', d = url.searchParams.get('d') ?? ''
  if (!y || !m || !d) throw error(400, 'y, m, d are required')

  try {
    const [contents] = await getGcsBucket().file(`${y}/${m}/${d}/note.txt`).download()
    return new Response(contents.toString('utf-8'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  } catch (e: any) {
    if (e?.code === 404) return new Response('', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
    throw error(502, 'Failed to read note')
  }
}

export const POST: RequestHandler = async (event) => {
  const { request, url } = event
  await requireAuth(event)
  const y = url.searchParams.get('y') ?? '', m = url.searchParams.get('m') ?? '', d = url.searchParams.get('d') ?? ''
  if (!y || !m || !d) throw error(400, 'y, m, d are required')

  const text = await request.text()
  await getGcsBucket().file(`${y}/${m}/${d}/note.txt`).save(text, { contentType: 'text/plain; charset=utf-8' })
  return json({ ok: true })
}
