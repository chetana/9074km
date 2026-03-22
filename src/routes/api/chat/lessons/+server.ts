import { error, json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireAuth } from '$lib/server/auth'
import { getGcsBucket } from '$lib/server/gcs'

export const GET: RequestHandler = async ({ request }) => {
  await requireAuth(request)
  const bucket = getGcsBucket()
  try {
    const [contents] = await bucket.file('chat/lessons.json').download()
    return json(JSON.parse(contents.toString('utf-8')))
  } catch (e: any) {
    if (e?.code === 404) return json([])
    throw error(502, 'Failed to read lessons')
  }
}
