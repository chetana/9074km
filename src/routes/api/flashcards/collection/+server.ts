import { error, json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireAuth } from '$lib/server/auth'
import { getGcsBucket } from '$lib/server/gcs'
import { cardGameCors } from '$lib/server/cors'

function normalizeName(name: string) {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

export const OPTIONS: RequestHandler = async ({ request }) => {
  return new Response(null, { status: 204, headers: cardGameCors(request.headers.get('origin')) })
}

export const GET: RequestHandler = async (event) => {
  const { request } = event
  const me = await requireAuth(event)
  const origin = request.headers.get('origin')
  const bucket = getGcsBucket()
  const myEmail = me.email
  const myFirstName = me.name?.split(' ')[0] ?? ''

  // Lister tous les fichiers progress-*.json dynamiquement (gère les accents : chétana, etc.)
  let files: any[]
  try {
    ;[files] = await bucket.getFiles({ prefix: 'flashcards/progress-' })
  } catch {
    throw error(502, 'Failed to list progress files')
  }

  const entries = await Promise.all(
    files.map(async (file: any) => {
      try {
        const [contents] = await file.download()
        const data = JSON.parse(contents.toString('utf-8'))
        const key = file.name.replace('flashcards/progress-', '').replace('.json', '')
        return { key, data, file }
      } catch {
        return null
      }
    })
  )

  // Construire un objet { [prénom]: progress } + trouver la clé "me"
  const result: Record<string, unknown> = {}
  let meKey: string | null = null

  for (const entry of entries) {
    if (!entry) continue
    result[entry.key] = entry.data
    // Correspondance par email (identifiant stable)
    if (myEmail && entry.data.email === myEmail) {
      meKey = entry.key
    }
  }

  // Fallback : normalisation du prénom (pour les fichiers sans email)
  if (!meKey && myFirstName) {
    const normMe = normalizeName(myFirstName)
    for (const entry of entries) {
      if (!entry) continue
      if (normalizeName(entry.key) === normMe) {
        meKey = entry.key
        // Migration automatique : écrire l'email dans le fichier pour les prochaines fois
        if (myEmail && !entry.data.email) {
          const updated = { ...entry.data, email: myEmail }
          await entry.file.save(JSON.stringify(updated), { contentType: 'application/json' })
        }
        break
      }
    }
  }

  return json({ ...result, _meKey: meKey }, { headers: cardGameCors(origin) })
}
