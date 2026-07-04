import { error, json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { signedGetUrl } from '$lib/server/gcs'

// Endpoint public — pas d'auth requise, restreint aux chemins fiancailles (YYYY/MM/DD/*)
export const GET: RequestHandler = async ({ url }) => {
  const path = url.searchParams.get('path')
  if (!path) throw error(400, 'path is required')

  // Sécurité : on n'autorise que des chemins de type YYYY/MM/DD/filename — pas de traversal
  if (!/^\d{4}\/\d{2}\/\d{2}\/[^/]+$/.test(path)) {
    throw error(403, 'Path not allowed')
  }

  return json({ url: await signedGetUrl(path) })
}
