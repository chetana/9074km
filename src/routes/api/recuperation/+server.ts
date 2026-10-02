import { error, json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireAuth } from '$lib/server/auth'
import { getGcsBucket } from '$lib/server/gcs'
import { isValidCoffrePrefix } from '$lib/server/coffre-path'

// Outil de récupération post-incident du 02/10/2026 (purge accidentelle du bucket
// chet-lys-coffre) : reconstruit les données manquantes du bucket à partir des caches
// localStorage des appareils (voir /recuperation). Idempotent — ne complete QUE ce qui
// manque, n'écrase jamais l'existant. À conserver tant que les téléphones n'ont pas
// été synchronisés, puis à supprimer avec la page /recuperation.

const DAY = /^\d{4}-\d{2}-\d{2}$/
const MAX_ITEMS = 500 // garde-fou : jours/blocs par requête

interface BlocJour { day: string; [k: string]: unknown }

const parts = (day: string) => day.split('-') // [y, m, d] zero-paddés
const jour = (b: BlocJour) => {
  if (!b || !DAY.test(b.day ?? '')) throw error(400, `jour invalide: ${b?.day}`)
  return parts(b.day)
}

async function readJson(bucket: ReturnType<typeof getGcsBucket>, path: string): Promise<unknown | null> {
  try {
    const [c] = await bucket.file(path).download()
    return JSON.parse(c.toString('utf-8'))
  } catch (e: any) {
    if (e?.code === 404) return null
    throw e
  }
}

async function existe(bucket: ReturnType<typeof getGcsBucket>, path: string): Promise<boolean> {
  try { await bucket.file(path).download(); return true } catch (e: any) {
    if (e?.code === 404) return false
    throw e
  }
}

export const POST: RequestHandler = async (event) => {
  const user = await requireAuth(event)
  const { request } = event
  const body = await request.json().catch(() => null) as {
    messages?: BlocJour[]
    notes?: BlocJour[]
    reactions?: BlocJour[]
    metas?: BlocJour[]
    lists?: { prefix: string; names: string[] }[]
  } | null
  if (!body) throw error(400, 'body JSON requis')
  console.log(`[recuperation] demande de ${user.name ?? '?'}`)

  const bucket = getGcsBucket()

  // ── Messages de chat : fusion par id, tri par ts ──────────────────────────
  const messagesRestored: { day: string; added: number }[] = []
  for (const bloc of (body.messages ?? []).slice(0, MAX_ITEMS)) {
    const [y, m, d] = jour(bloc)
    const msgs = Array.isArray(bloc.msgs) ? bloc.msgs.slice(0, MAX_ITEMS) : []
    const path = `chat/${y}/${m}/${d}.json`
    const existing = (await readJson(bucket, path)) as any[] | null
    const connus = new Set((existing ?? []).map((x: any) => x?.id))
    const ajout = msgs.filter((x: any) => x?.id && !connus.has(x.id))
    if (!ajout.length) continue
    const fusion = [...(existing ?? []), ...ajout].sort((a: any, b: any) => String(a?.ts ?? '').localeCompare(String(b?.ts ?? '')))
    await bucket.file(path).save(JSON.stringify(fusion), { contentType: 'application/json' })
    messagesRestored.push({ day: bloc.day, added: ajout.length })
  }

  // ── SUITE: notes, réactions, meta, listes ──────────────────────────────────
  const { notesRestored, reactionsMerged, metasRestored } = await restaurerReste(body, bucket)
  const missingFiles = await rapportManquants(body, bucket)

  return json({ ok: true, messagesRestored, notesRestored, reactionsMerged, metasRestored, missingFiles })
}

async function restaurerReste(
  body: { notes?: BlocJour[]; reactions?: BlocJour[]; metas?: BlocJour[] },
  bucket: ReturnType<typeof getGcsBucket>,
): Promise<{ notesRestored: string[]; reactionsMerged: string[]; metasRestored: string[] }> {
  const notesRestored: string[] = []
  for (const bloc of (body.notes ?? []).slice(0, MAX_ITEMS)) {
    const [y, m, d] = jour(bloc)
    const text = typeof bloc.text === 'string' ? bloc.text : ''
    if (!text) continue
    const path = `${y}/${m}/${d}/note.txt`
    if (await existe(bucket, path)) continue // existe déjà → on n'écrase pas
    await bucket.file(path).save(text, { contentType: 'text/plain; charset=utf-8' })
    notesRestored.push(bloc.day)
  }

  // Réactions & meta : fusion des clés manquantes
  const reactionsMerged: string[] = []
  for (const bloc of (body.reactions ?? []).slice(0, MAX_ITEMS)) {
    const [y, m, d] = jour(bloc)
    const data = bloc.data as Record<string, string[]> | null
    if (!data || typeof data !== 'object') continue
    const path = `${y}/${m}/${d}/reactions.json`
    const existing = (await readJson(bucket, path)) as Record<string, string[]> | null
    if (!existing) {
      await bucket.file(path).save(JSON.stringify(data), { contentType: 'application/json' })
      reactionsMerged.push(bloc.day)
      continue
    }
    const fusion: Record<string, string[]> = { ...existing }
    let change = false
    for (const [k, v] of Object.entries(data)) if (!fusion[k]) { fusion[k] = v; change = true }
    if (change) {
      await bucket.file(path).save(JSON.stringify(fusion), { contentType: 'application/json' })
      reactionsMerged.push(bloc.day)
    }
  }

  const metasRestored: string[] = []
  for (const bloc of (body.metas ?? []).slice(0, MAX_ITEMS)) {
    const [y, m, d] = jour(bloc)
    const data = bloc.data as Record<string, unknown> | null
    if (!data || typeof data !== 'object') continue
    const path = `${y}/${m}/${d}/meta.json`
    const existing = (await readJson(bucket, path)) as Record<string, unknown> | null
    if (!existing) {
      await bucket.file(path).save(JSON.stringify(data), { contentType: 'application/json' })
      metasRestored.push(bloc.day)
      continue
    }
    const fusion: Record<string, unknown> = { ...existing }
    let change = false
    for (const [k, v] of Object.entries(data)) if (fusion[k] === undefined) { fusion[k] = v; change = true }
    if (change) {
      await bucket.file(path).save(JSON.stringify(fusion), { contentType: 'application/json' })
      metasRestored.push(bloc.day)
    }
  }

  return { notesRestored, reactionsMerged, metasRestored }
}

// Listes de fichiers en cache → rapport des fichiers manquants du bucket
async function rapportManquants(
  body: { lists?: { prefix: string; names: string[] }[] },
  bucket: ReturnType<typeof getGcsBucket>,
): Promise<{ prefix: string; names: string[] }[]> {
  const missingFiles: { prefix: string; names: string[] }[] = []
  for (const l of (body.lists ?? []).slice(0, MAX_ITEMS)) {
    if (!l?.prefix || !isValidCoffrePrefix(l.prefix)) continue
    const names = Array.isArray(l.names) ? l.names.slice(0, MAX_ITEMS) : []
    if (!names.length) continue
    const out = await bucket.getFiles({ prefix: l.prefix })
    const presents = new Set((out[0] ?? []).map((f: any) => f.name))
    const manquants = names.filter((n: string) => typeof n === 'string' && n && !presents.has(n))
    if (manquants.length) missingFiles.push({ prefix: l.prefix, names: manquants })
  }
  return missingFiles
}
