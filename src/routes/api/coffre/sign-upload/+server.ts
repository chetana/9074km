import { error, json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireAuth } from '$lib/server/auth'
import { signedPutUrl } from '$lib/server/gcs'
import { isValidCoffrePath } from '$lib/server/coffre-path'

export const POST: RequestHandler = async (event) => {
  const { request } = event
  await requireAuth(event)
  const { path, contentType } = await request.json() as { path: string; contentType: string }
  if (!path || !contentType) throw error(400, 'path and contentType are required')
  if (!isValidCoffrePath(path)) throw error(400, 'invalid path')

  try {
    return json({ url: await signedPutUrl(path, contentType) })
  } catch (e: any) {
    throw error(500, e?.message ?? String(e))
  }
}
