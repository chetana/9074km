import { error, json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireAuth } from '$lib/server/auth'
import { getGcsBucket } from '$lib/server/gcs'
import { isValidCoffrePath } from '$lib/server/coffre-path'

export const DELETE: RequestHandler = async (event) => {
  const { request, url } = event
  await requireAuth(event)
  const path = url.searchParams.get('path')
  if (!path) throw error(400, 'path is required')
  if (!isValidCoffrePath(path)) throw error(400, 'invalid path')
  await getGcsBucket().file(path).delete()
  return json({ success: true })
}
