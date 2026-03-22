import { error, json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireAuth } from '$lib/server/auth'
import { getGcsBucket } from '$lib/server/gcs'

export const GET: RequestHandler = async ({ request, url }) => {
  await requireAuth(request)
  const y = url.searchParams.get('y') ?? '', m = url.searchParams.get('m') ?? '', d = url.searchParams.get('d') ?? ''
  if (!y || !m || !d) throw error(400, 'y, m, d are required')

  try {
    const [contents] = await getGcsBucket().file(`${y}/${m}/${d}/meta.json`).download()
    return json(JSON.parse(contents.toString('utf-8')))
  } catch (e: any) {
    if (e?.code === 404) return json({})
    throw error(502, 'Failed to read meta')
  }
}

export const POST: RequestHandler = async ({ request, url }) => {
  await requireAuth(request)
  const y = url.searchParams.get('y') ?? '', m = url.searchParams.get('m') ?? '', d = url.searchParams.get('d') ?? ''
  if (!y || !m || !d) throw error(400, 'y, m, d are required')

  const body = await request.json()
  await getGcsBucket().file(`${y}/${m}/${d}/meta.json`).save(JSON.stringify(body), { contentType: 'application/json' })
  return json({ ok: true })
}
