import { error, json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireAuth } from '$lib/server/auth'
import { getGcsBucket } from '$lib/server/gcs'

export const GET: RequestHandler = async ({ request, url }) => {
  await requireAuth(request)
  const prefix = url.searchParams.get('prefix') ?? ''
  const bucket = getGcsBucket()

  const [files, , apiResponse] = await bucket.getFiles({ prefix, delimiter: '/', autoPaginate: false })
  const prefixes: string[] = (apiResponse as any)?.prefixes ?? []
  const items = files
    .filter(f => f.name !== prefix && !f.name.endsWith('/'))
    .map(f => ({
      name: f.name,
      size: Number(f.metadata?.size ?? 0),
      contentType: (f.metadata as any)?.contentType ?? '',
      updated: (f.metadata as any)?.updated ?? '',
    }))

  return json({ prefixes, items })
}
