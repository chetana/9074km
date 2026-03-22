import { error, json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireAuth } from '$lib/server/auth'
import { getGcsBucket } from '$lib/server/gcs'

const ALLOWED_ORIGINS = [
  'https://card-game-267131866578.europe-west1.run.app',
  'https://cards.chetana.dev',
  'http://localhost:5174',
]

function corsHeaders(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[2]
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  }
}

export const OPTIONS: RequestHandler = async ({ request }) => {
  const origin = request.headers.get('origin')
  return new Response(null, { status: 204, headers: corsHeaders(origin) })
}

export const GET: RequestHandler = async ({ request }) => {
  await requireAuth(request)
  const origin = request.headers.get('origin')
  const bucket = getGcsBucket()

  async function readProgress(name: string) {
    try {
      const [contents] = await bucket.file(`flashcards/progress-${name}.json`).download()
      return JSON.parse(contents.toString('utf-8'))
    } catch (e: any) {
      if (e?.code === 404) return { name, xp: 0, sessions: [] }
      throw error(502, `Failed to read progress for ${name}`)
    }
  }

  const [chet, lys] = await Promise.all([
    readProgress('chet'),
    readProgress('lys'),
  ])

  return json({ chet, lys }, { headers: corsHeaders(origin) })
}
