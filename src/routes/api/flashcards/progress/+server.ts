import { error, json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireAuth } from '$lib/server/auth'
import { getGcsBucket } from '$lib/server/gcs'
import { cardGameCors } from '$lib/server/cors'

export interface FlashProgress {
  name: string
  xp: number
  sessions: { date: string; correct: number; approx: number; wrong: number; xp_gained: number }[]
}

function progressPath(name: string) {
  return `flashcards/progress-${name.toLowerCase()}.json`
}

export const OPTIONS: RequestHandler = async ({ request }) => {
  return new Response(null, { status: 204, headers: cardGameCors(request.headers.get('origin')) })
}

export const GET: RequestHandler = async ({ request }) => {
  const user = await requireAuth(request)
  const name = user.name?.split(' ')[0] ?? 'unknown'
  const bucket = getGcsBucket()
  const cors = cardGameCors(request.headers.get('origin'))
  try {
    const [contents] = await bucket.file(progressPath(name)).download()
    return json(JSON.parse(contents.toString('utf-8')), { headers: cors })
  } catch (e: any) {
    if (e?.code === 404) return json({ name, xp: 0, sessions: [] } satisfies FlashProgress, { headers: cors })
    throw error(502, 'Failed to read progress')
  }
}

export const POST: RequestHandler = async ({ request }) => {
  const user = await requireAuth(request)
  const name = user.name?.split(' ')[0] ?? 'unknown'
  const body = await request.json() as { correct: number; approx: number; wrong: number; xp_gained: number }

  const bucket = getGcsBucket()
  let progress: FlashProgress = { name, xp: 0, sessions: [] }
  try {
    const [contents] = await bucket.file(progressPath(name)).download()
    progress = JSON.parse(contents.toString('utf-8'))
  } catch (e: any) {
    if (e?.code !== 404) throw error(502, 'Failed to read progress')
  }

  progress.xp += body.xp_gained
  progress.sessions.unshift({
    date: new Date().toISOString().slice(0, 10),
    correct: body.correct,
    approx: body.approx,
    wrong: body.wrong,
    xp_gained: body.xp_gained,
  })
  // Garder les 100 dernières sessions
  if (progress.sessions.length > 100) progress.sessions = progress.sessions.slice(0, 100)

  await bucket.file(progressPath(name)).save(JSON.stringify(progress), { contentType: 'application/json' })
  return json(progress)
}
