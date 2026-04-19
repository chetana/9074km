import { error, json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireAuth } from '$lib/server/auth'
import { signedGetUrl } from '$lib/server/gcs'

export const GET: RequestHandler = async (event) => {
  const { request, url } = event
  await requireAuth(event)
  const path = url.searchParams.get('path')
  if (!path) throw error(400, 'path is required')
  return json({ url: signedGetUrl(path) })
}
