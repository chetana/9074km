import { error, json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireAuth } from '$lib/server/auth'
import { getGcsBucket } from '$lib/server/gcs'

export const GET: RequestHandler = async ({ request, url }) => {
  await requireAuth(request)
  const prefix = url.searchParams.get('prefix') ?? ''
  const bucket = getGcsBucket()

  console.log('[coffre/list] bucket name:', (bucket as any).name, 'prefix:', JSON.stringify(prefix))

  let files: any[], apiResponse: any
  try {
    ;[files, , apiResponse] = await bucket.getFiles({ prefix, delimiter: '/', autoPaginate: false })
  } catch (e: any) {
    console.error('[coffre/list] getFiles error:', e?.code, e?.message, e?.errors)
    throw error(502, `GCS error: ${e?.message ?? e}`)
  }
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
