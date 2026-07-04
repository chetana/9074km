import { error, json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { getGcsBucket } from '$lib/server/gcs'

// Endpoint public — pas d'auth requise, limité au préfixe fiancailles (YYYY/MM/DD/)
export const GET: RequestHandler = async ({ url }) => {
  const y = url.searchParams.get('y') ?? '2026'
  const m = url.searchParams.get('m') ?? '05'
  const d = url.searchParams.get('d') ?? '22'

  // Sécurité : on n'accepte que des dates valides, pas de path traversal
  if (!/^\d{4}$/.test(y) || !/^\d{2}$/.test(m) || !/^\d{2}$/.test(d)) {
    throw error(400, 'Invalid date')
  }

  const prefix = `${y}/${m}/${d}/`
  const bucket = getGcsBucket()

  let files: any[], apiResponse: any
  try {
    ;[files, , apiResponse] = await bucket.getFiles({ prefix, delimiter: '/', autoPaginate: false })
  } catch (e: any) {
    throw error(502, `GCS error: ${e?.message ?? e}`)
  }

  const items = files
    .filter(f => f.name !== prefix && !f.name.endsWith('/'))
    .map(f => ({
      name: f.name,
      size: Number(f.metadata?.size ?? 0),
      contentType: (f.metadata as any)?.contentType ?? '',
    }))

  return json({ items })
}
