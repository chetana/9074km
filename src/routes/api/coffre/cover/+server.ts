import { error, json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireAuth } from '$lib/server/auth'
import { getGcsBucket } from '$lib/server/gcs'
import { isValidCoverPrefix, isMediaFile } from '$lib/server/coffre-path'

// Couverture d'une année ou d'un mois pour YearList/MonthList — le fichier média le plus récent
// sous ce préfixe (les clés S3 YYYY/MM/DD/nom trient déjà chronologiquement en ordre lexical).
// Plan de modernisation P6 (photos de couverture), 23/09/2026.
export const GET: RequestHandler = async (event) => {
  const { url } = event
  await requireAuth(event)
  const prefix = url.searchParams.get('prefix') ?? ''
  if (!isValidCoverPrefix(prefix)) throw error(400, 'invalid prefix')

  const bucket = getGcsBucket()
  let files: any[]
  try {
    // Pas de delimiter ici : on veut TOUS les fichiers sous le préfixe (récursif sur les
    // mois/jours), pas seulement le niveau immédiat comme /api/coffre/list.
    ;[files] = await bucket.getFiles({ prefix, autoPaginate: false })
  } catch (e: any) {
    console.error('[coffre/cover] getFiles error:', e?.code, e?.message)
    throw error(502, `GCS error: ${e?.message ?? e}`)
  }

  const cover = files
    .map(f => f.name as string)
    .filter(isMediaFile)
    .sort()
    .pop() ?? null

  return json({ cover })
}
