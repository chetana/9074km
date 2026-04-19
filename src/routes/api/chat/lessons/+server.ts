import { error, json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireAuth } from '$lib/server/auth'
import { getGcsBucket } from '$lib/server/gcs'

const NO_STORE = { 'Cache-Control': 'no-store, must-revalidate' }

export const GET: RequestHandler = async (event) => {
  const { request } = event
  await requireAuth(event)
  const bucket = getGcsBucket()
  try {
    const [contents] = await bucket.file('chat/lessons.json').download()
    return json(JSON.parse(contents.toString('utf-8')), { headers: NO_STORE })
  } catch (e: any) {
    if (e?.code === 404) return json([], { headers: NO_STORE })
    throw error(502, 'Failed to read lessons')
  }
}
