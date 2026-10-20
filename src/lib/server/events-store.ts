import { sql } from 'drizzle-orm'
import { getDB } from './db'
import type { CreateEventInput, NameLang, PatchEventInput } from './events-validate'
import type { EventDTO } from '../events-types'

export type { EventDTO }

type Db = ReturnType<typeof getDB>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
type Row = Record<string, any>

const IMAGE_RE = `\\.(jpe?g|png|webp|gif|heic)$`

// Colonnes d'un évènement + compte + couverture (cover_path, sinon dernière image : même règle que cover/+server.ts).
const SELECT_EVENT = sql`
  SELECT e.id, e.name_fr, e.name_en, e.name_kh, e.name_src_lang, e.names_pending,
    to_char(e.date_start, 'YYYY-MM-DD') AS date_start, to_char(e.date_end, 'YYYY-MM-DD') AS date_end,
    e.place, e.emoji, e.color, e.auto_attach, e.version,
    (SELECT count(*) FROM event_media m WHERE m.event_id = e.id)::int AS count,
    COALESCE(e.cover_path, (SELECT max(m.media_path) FROM event_media m
      WHERE m.event_id = e.id AND m.media_path ~* ${IMAGE_RE})) AS cover
  FROM events e`

export function toDTO(r: Row, today: string): EventDTO {
  return {
    id: r.id,
    names: { fr: r.name_fr, en: r.name_en, kh: r.name_kh },
    nameSrcLang: r.name_src_lang,
    namesPending: r.names_pending,
    dates: { start: r.date_start, end: r.date_end },
    cover: r.cover ?? null,
    place: r.place ?? null,
    emoji: r.emoji ?? null,
    color: r.color,
    autoAttach: r.auto_attach,
    version: r.version,
    count: r.count,
    upcoming: r.date_start > today,
  }
}

// Les tableaux JS sont développés en liste de paramètres par drizzle : on construit un ARRAY[...] explicite.
const textArray = (v: string[]) => sql`ARRAY[${sql.join(v.map((x) => sql`${x}`), sql`, `)}]::text[]`

const rows = (res: any): Row[] => res.rows ?? res

export async function listEvents(opts: { year?: string; place?: string; today: string }): Promise<EventDTO[]> {
  const where = [sql`e.deleted_at IS NULL`]
  if (opts.year) where.push(sql`e.date_start <= ${`${opts.year}-12-31`}::date AND e.date_end >= ${`${opts.year}-01-01`}::date`)
  if (opts.place) where.push(sql`lower(e.place) = lower(${opts.place})`)
  const res = await getDB().execute(sql`${SELECT_EVENT} WHERE ${sql.join(where, sql` AND `)} ORDER BY e.date_start DESC, e.id DESC`)
  return rows(res).map((r) => toDTO(r, opts.today))
}

export async function getEvent(id: number, today: string, db: Db | Tx = getDB()): Promise<EventDTO | null> {
  const res = await db.execute(sql`${SELECT_EVENT} WHERE e.id = ${id} AND e.deleted_at IS NULL`)
  const r = rows(res)[0]
  return r ? toDTO(r, today) : null
}

export interface NewEventNames { fr: string; en: string; kh: string; srcLang: NameLang; pending: boolean }

export async function createEvent(userId: number, input: CreateEventInput, names: NewEventNames, today: string): Promise<EventDTO> {
  return getDB().transaction(async (tx) => {
    const ins = rows(await tx.execute(sql`
      INSERT INTO events (name_fr, name_en, name_kh, name_src_lang, names_pending, date_start, date_end, place, emoji, color, auto_attach, created_by)
      VALUES (${names.fr}, ${names.en}, ${names.kh}, ${names.srcLang}, ${names.pending}, ${input.dateStart}::date, ${input.dateEnd}::date,
        ${input.place}, ${input.emoji}, ${input.color}, ${input.autoAttach}, ${userId})
      RETURNING id`))
    const id = ins[0].id as number
    if (input.mediaPaths.length) await attachMedia(tx, id, userId, input.mediaPaths)
    return (await getEvent(id, today, tx))!
  })
}

export type AttachMode = 'move' | 'keep'
export interface AttachResult { added: string[]; skipped: { path: string; eventId: number }[] }

/**
 * Rattache des photos. `move` = déplacement explicite (une photo quitte son ancien évènement) ;
 * `keep` = ne touche JAMAIS une photo déjà rangée dans un AUTRE évènement vivant (deux appareils, même nom
 * de fichier) : elle est rendue dans `skipped`. Tout se décide dans un seul INSERT … ON CONFLICT (atomique).
 */
async function attachMedia(tx: Tx, eventId: number, userId: number, paths: string[], mode: AttachMode = 'move'): Promise<AttachResult> {
  const guard = mode === 'move' ? sql`true`
    : sql`event_media.event_id = EXCLUDED.event_id OR NOT EXISTS (SELECT 1 FROM events ev WHERE ev.id = event_media.event_id AND ev.deleted_at IS NULL)`
  const ins = rows(await tx.execute(sql`
    INSERT INTO event_media (media_path, event_id, added_by)
    SELECT p, ${eventId}, ${userId} FROM unnest(${textArray(paths)}) AS p
    ON CONFLICT (media_path) DO UPDATE SET event_id = EXCLUDED.event_id, added_by = EXCLUDED.added_by, added_at = now()
    WHERE ${guard}
    RETURNING media_path`))
  const added = ins.map((r) => r.media_path as string)
  const addedSet = new Set(added)
  const left = paths.filter((p) => !addedSet.has(p))
  let skipped: { path: string; eventId: number }[] = []
  if (left.length) {
    skipped = rows(await tx.execute(sql`SELECT media_path, event_id FROM event_media WHERE media_path = ANY(${textArray(left)})`))
      .map((r) => ({ path: r.media_path as string, eventId: r.event_id as number }))
  }
  if (added.length) await tx.execute(sql`UPDATE events SET cover_path = NULL WHERE id <> ${eventId} AND cover_path = ANY(${textArray(added)})`)
  return { added, skipped }
}

export type PatchOutcome =
  | { kind: 'ok'; event: EventDTO }
  | { kind: 'not_found' }
  | { kind: 'conflict'; current: EventDTO }
  | { kind: 'invalid'; message: string }

export interface PatchColumns {
  names?: Partial<Record<NameLang, string>>
  srcLang?: NameLang
  namesPending?: boolean
}

export async function patchEvent(id: number, p: PatchEventInput, cols: PatchColumns, today: string): Promise<PatchOutcome> {
  const sets = [sql`version = version + 1`, sql`updated_at = now()`]
  if (cols.names?.fr !== undefined) sets.push(sql`name_fr = ${cols.names.fr}`)
  if (cols.names?.en !== undefined) sets.push(sql`name_en = ${cols.names.en}`)
  if (cols.names?.kh !== undefined) sets.push(sql`name_kh = ${cols.names.kh}`)
  if (cols.srcLang !== undefined) sets.push(sql`name_src_lang = ${cols.srcLang}`)
  if (cols.namesPending !== undefined) sets.push(sql`names_pending = ${cols.namesPending}`)
  if (p.dateStart !== undefined) sets.push(sql`date_start = ${p.dateStart}::date`)
  if (p.dateEnd !== undefined) sets.push(sql`date_end = ${p.dateEnd}::date`)
  if (p.place !== undefined) sets.push(sql`place = ${p.place}`)
  if (p.emoji !== undefined) sets.push(sql`emoji = ${p.emoji}`)
  if (p.color !== undefined) sets.push(sql`color = ${p.color}`)
  if (p.autoAttach !== undefined) sets.push(sql`auto_attach = ${p.autoAttach}`)
  if (p.coverPath !== undefined) sets.push(sql`cover_path = ${p.coverPath}`)

  try {
    return await getDB().transaction(async (tx) => {
      // Une couverture doit appartenir à l'évènement.
      if (p.coverPath) {
        const own = rows(await tx.execute(sql`SELECT 1 FROM event_media WHERE media_path = ${p.coverPath} AND event_id = ${id}`))
        if (!own.length) return { kind: 'invalid', message: 'coverPath is not in this event' } as PatchOutcome
      }
      const upd = rows(await tx.execute(sql`
        UPDATE events SET ${sql.join(sets, sql`, `)}
        WHERE id = ${id} AND deleted_at IS NULL AND version = ${p.ifVersion} RETURNING id`))
      if (upd.length) return { kind: 'ok', event: (await getEvent(id, today, tx))! } as PatchOutcome
      const current = await getEvent(id, today, tx)
      return current ? ({ kind: 'conflict', current } as PatchOutcome) : ({ kind: 'not_found' } as PatchOutcome)
    })
  } catch (e: any) {
    const code = e?.code ?? e?.cause?.code
    if (code === '23514') return { kind: 'invalid', message: 'invalid date range' }
    throw e
  }
}

export async function softDeleteEvent(id: number): Promise<boolean> {
  const res = rows(await getDB().execute(sql`UPDATE events SET deleted_at = now(), updated_at = now() WHERE id = ${id} AND deleted_at IS NULL RETURNING id`))
  return res.length > 0
}

/** Écrit les traductions arrivées en retard, sauf si le nom source a été modifié entre-temps. */
export async function applyTranslations(
  id: number, srcLang: NameLang, srcText: string, t: { fr: string; en: string; kh: string }
): Promise<boolean> {
  const srcCol = srcLang === 'fr' ? sql`name_fr` : srcLang === 'en' ? sql`name_en` : sql`name_kh`
  const res = rows(await getDB().execute(sql`
    UPDATE events SET name_fr = ${t.fr}, name_en = ${t.en}, name_kh = ${t.kh}, names_pending = false, updated_at = now()
    WHERE id = ${id} AND deleted_at IS NULL AND names_pending = true AND name_src_lang = ${srcLang} AND ${srcCol} = ${srcText}
    RETURNING id`))
  return res.length > 0
}

export async function listEventMedia(id: number): Promise<string[] | null> {
  const db = getDB()
  const ev = rows(await db.execute(sql`SELECT 1 FROM events WHERE id = ${id} AND deleted_at IS NULL`))
  if (!ev.length) return null
  const res = rows(await db.execute(sql`SELECT media_path FROM event_media WHERE event_id = ${id} ORDER BY media_path`))
  return res.map((r) => r.media_path as string)
}

export async function addEventMedia(id: number, userId: number, paths: string[], mode: AttachMode = 'move'): Promise<AttachResult | false> {
  return getDB().transaction(async (tx) => {
    const ev = rows(await tx.execute(sql`SELECT 1 FROM events WHERE id = ${id} AND deleted_at IS NULL FOR SHARE`))
    if (!ev.length) return false
    return attachMedia(tx, id, userId, paths, mode)
  })
}

export async function removeEventMedia(id: number, paths: string[]): Promise<number | null> {
  return getDB().transaction(async (tx) => {
    const ev = rows(await tx.execute(sql`SELECT 1 FROM events WHERE id = ${id} AND deleted_at IS NULL`))
    if (!ev.length) return null
    const del = rows(await tx.execute(sql`DELETE FROM event_media WHERE event_id = ${id} AND media_path = ANY(${textArray(paths)}) RETURNING media_path`))
    await tx.execute(sql`UPDATE events SET cover_path = NULL WHERE id = ${id} AND cover_path = ANY(${textArray(paths)})`)
    return del.length
  })
}

/** Évènements couvrant la date (auto_attach d'abord) + évènement de chaque photo de ce jour. */
export async function eventsForDate(d: string, today: string): Promise<{ events: EventDTO[]; tags: Record<string, number>; tagEvents: EventDTO[] }> {
  const db = getDB()
  const cov = rows(await db.execute(sql`${SELECT_EVENT}
    WHERE e.deleted_at IS NULL AND e.date_start <= ${d}::date AND e.date_end >= ${d}::date
    ORDER BY e.auto_attach DESC, e.date_start DESC, e.id DESC`))
  const [y, m, dd] = d.split('-')
  const like = `${y}/${m}/${dd}/%`
  const tagRows = rows(await db.execute(sql`
    SELECT m.media_path, m.event_id FROM event_media m JOIN events e ON e.id = m.event_id
    WHERE e.deleted_at IS NULL AND m.media_path LIKE ${like}`))
  const tags: Record<string, number> = {}
  for (const r of tagRows) tags[r.media_path] = r.event_id
  const covering = cov.map((r) => toDTO(r, today))
  const known = new Set(covering.map((e) => e.id))
  const extraIds = [...new Set(Object.values(tags))].filter((i) => !known.has(i))
  const tagEvents = [...covering]
  for (const id of extraIds) {
    const ev = await getEvent(id, today, db)
    if (ev) tagEvents.push(ev)
  }
  return { events: covering, tags, tagEvents }
}

/** Photo supprimée du coffre : on la détache de son évènement et on libère une couverture qui la visait. */
export async function forgetMediaPath(path: string): Promise<void> {
  await getDB().transaction(async (tx) => {
    await tx.execute(sql`DELETE FROM event_media WHERE media_path = ${path}`)
    await tx.execute(sql`UPDATE events SET cover_path = NULL WHERE cover_path = ${path}`)
  })
}

export interface ExportedEvent {
  id: number
  names: { fr: string; en: string; kh: string }
  dates: { start: string; end: string }
  nameSrcLang: NameLang
  namesPending: boolean
  coverPath: string | null
  place: string | null
  emoji: string | null
  color: string
  autoAttach: boolean
  version: number
  createdAt: string
  photos: string[]
}

/** Export JSON : évènements vivants + chemins de leurs photos. Jamais de GPS, d'uploader ni d'identifiant d'utilisateur. */
export async function exportEvents(): Promise<ExportedEvent[]> {
  const db = getDB()
  const evs = rows(await db.execute(sql`
    SELECT e.id, e.name_fr, e.name_en, e.name_kh, e.name_src_lang, e.names_pending, e.cover_path, to_char(e.date_start, 'YYYY-MM-DD') AS date_start, to_char(e.date_end, 'YYYY-MM-DD') AS date_end,
      e.place, e.emoji, e.color, e.auto_attach, e.version, to_char(e.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
    FROM events e WHERE e.deleted_at IS NULL ORDER BY e.date_start, e.id`))
  const media = rows(await db.execute(sql`
    SELECT m.event_id, m.media_path FROM event_media m JOIN events e ON e.id = m.event_id AND e.deleted_at IS NULL ORDER BY m.media_path`))
  const byEvent = new Map<number, string[]>()
  for (const m of media) byEvent.set(m.event_id, [...(byEvent.get(m.event_id) ?? []), m.media_path])
  return evs.map((r) => ({
    id: r.id, names: { fr: r.name_fr, en: r.name_en, kh: r.name_kh }, dates: { start: r.date_start, end: r.date_end },
    nameSrcLang: r.name_src_lang, namesPending: r.names_pending, coverPath: r.cover_path ?? null,
    place: r.place ?? null, emoji: r.emoji ?? null, color: r.color, autoAttach: r.auto_attach, version: r.version,
    createdAt: r.created_at, photos: byEvent.get(r.id) ?? [],
  }))
}

/** Évènements vivants, dates seulement (pour les suggestions). */
export async function liveEventRanges(): Promise<{ id: number; start: string; end: string }[]> {
  const r = rows(await getDB().execute(sql`SELECT id, to_char(date_start, 'YYYY-MM-DD') AS s, to_char(date_end, 'YYYY-MM-DD') AS e FROM events WHERE deleted_at IS NULL ORDER BY id`))
  return r.map((x) => ({ id: x.id, start: x.s, end: x.e }))
}
