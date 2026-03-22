import { error, json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireAuth } from '$lib/server/auth'
import { getGcsBucket } from '$lib/server/gcs'
import { cardGameCors } from '$lib/server/cors'

export const OPTIONS: RequestHandler = async ({ request }) => {
  return new Response(null, { status: 204, headers: cardGameCors(request.headers.get('origin')) })
}

export const GET: RequestHandler = async ({ request }) => {
  await requireAuth(request)
  const origin = request.headers.get('origin')
  const bucket = getGcsBucket()

  // Lister tous les fichiers progress-*.json dynamiquement (gère les accents : chétana, etc.)
  let files: { name: string }[]
  try {
    ;[files] = await bucket.getFiles({ prefix: 'flashcards/progress-' })
  } catch {
    throw error(502, 'Failed to list progress files')
  }

  const entries = await Promise.all(
    files.map(async (file) => {
      try {
        const [contents] = await file.download()
        const data = JSON.parse(contents.toString('utf-8'))
        // Extraire le prénom depuis le nom du fichier (flashcards/progress-{name}.json)
        const fileName = file.name.replace('flashcards/progress-', '').replace('.json', '')
        return { key: fileName, data }
      } catch {
        return null
      }
    })
  )

  // Construire un objet { [prénom]: progress }
  const result: Record<string, unknown> = {}
  for (const entry of entries) {
    if (entry) result[entry.key] = entry.data
  }

  return json(result, { headers: cardGameCors(origin) })
}
