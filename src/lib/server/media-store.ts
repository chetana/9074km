import { sql } from 'drizzle-orm'
import { getDB } from './db'
import { isImageFile } from './coffre-path'
import type { MediaItemInput } from './events-validate'

/** Enregistre (ou met à jour) les photos envoyées avec leurs métadonnées EXIF. day/kind sont déduits du chemin. */
export async function recordMedia(uploadedBy: string | null, items: MediaItemInput[]): Promise<number> {
  if (!items.length) return 0
  const tuples = items.map((i) => {
    const [y, m, d] = i.path.split('/')
    return sql`(${i.path}, ${`${y}-${m}-${d}`}::date, ${isImageFile(i.path) ? 'image' : 'video'}, ${i.size}, ${uploadedBy},
      ${i.takenAt}::timestamp, ${i.takenOffset}, ${i.lat}::double precision, ${i.lng}::double precision, ${i.make}, ${i.model})`
  })
  await getDB().execute(sql`
    INSERT INTO media (path, day, kind, size, uploaded_by, taken_at, taken_offset, lat, lng, make, model)
    VALUES ${sql.join(tuples, sql`, `)}
    ON CONFLICT (path) DO UPDATE SET size = EXCLUDED.size, uploaded_by = EXCLUDED.uploaded_by, uploaded_at = now(),
      taken_at = EXCLUDED.taken_at, taken_offset = EXCLUDED.taken_offset, lat = EXCLUDED.lat, lng = EXCLUDED.lng,
      make = EXCLUDED.make, model = EXCLUDED.model, deleted_at = NULL`)
  return items.length
}

/** Photo supprimée du coffre : on garde la ligne (historique) et on la marque supprimée. */
export async function markMediaDeleted(path: string): Promise<void> {
  await getDB().execute(sql`UPDATE media SET deleted_at = now() WHERE path = ${path} AND deleted_at IS NULL`)
}

export interface UnclassifiedItem { path: string; day: string; kind: 'image' | 'video'; size: number | null; uploadedBy: string | null }

// « À classer » : ni supprimée, ni ignorée depuis moins de 30 jours (« Passer » ne revient pas avant), et rattachée
// à aucun évènement vivant.
const UNCLASSIFIED = sql`m.deleted_at IS NULL AND (m.skipped_at IS NULL OR m.skipped_at < now() - interval '30 days') AND NOT EXISTS (
  SELECT 1 FROM event_media e JOIN events ev ON ev.id = e.event_id AND ev.deleted_at IS NULL WHERE e.media_path = m.path)`

export async function countUnclassified(): Promise<number> {
  const r: any = await getDB().execute(sql`SELECT count(*)::int AS n FROM media m WHERE ${UNCLASSIFIED}`)
  return (r.rows ?? r)[0].n
}

/** Page de photos à classer, jour décroissant puis chemin décroissant (curseur à clé composite). */
export async function listUnclassified(limit: number, cursor: { day: string; path: string } | null): Promise<UnclassifiedItem[]> {
  const after = cursor ? sql`AND (m.day, m.path) < (${cursor.day}::date, ${cursor.path})` : sql``
  const r: any = await getDB().execute(sql`
    SELECT m.path, m.day::text AS day, m.kind, m.size, m.uploaded_by FROM media m
    WHERE ${UNCLASSIFIED} ${after}
    ORDER BY m.day DESC, m.path DESC LIMIT ${limit}`)
  return (r.rows ?? r).map((x: any) => ({ path: x.path, day: x.day, kind: x.kind, size: x.size === null ? null : Number(x.size), uploadedBy: x.uploaded_by ?? null }))
}

/** Toutes les photos à classer (chemin, jour, type) pour calculer les suggestions ; plafonné par sécurité. */
export async function listUnclassifiedForSuggestions(cap = 20000): Promise<{ path: string; day: string; kind: 'image' | 'video' }[]> {
  const r: any = await getDB().execute(sql`SELECT m.path, m.day::text AS day, m.kind FROM media m WHERE ${UNCLASSIFIED} ORDER BY m.day, m.path LIMIT ${cap}`)
  return (r.rows ?? r).map((x: any) => ({ path: x.path, day: x.day, kind: x.kind }))
}

/** « Passer » dans le mode tri : pose skipped_at (la photo ne revient pas avant 30 jours) ; undo = annulation immédiate. */
export async function skipMedia(paths: string[], undo = false): Promise<number> {
  const list = sql`ARRAY[${sql.join(paths.map((p) => sql`${p}`), sql`, `)}]::text[]`
  const r: any = await getDB().execute(undo
    ? sql`UPDATE media SET skipped_at = NULL WHERE path = ANY(${list}) AND skipped_at IS NOT NULL RETURNING path`
    : sql`UPDATE media SET skipped_at = now() WHERE path = ANY(${list}) AND deleted_at IS NULL RETURNING path`)
  return (r.rows ?? r).length
}

export interface DismissalRow { start: string; end: string; count: number }

export async function listDismissals(): Promise<DismissalRow[]> {
  const r: any = await getDB().execute(sql`SELECT to_char(range_start, 'YYYY-MM-DD') AS s, to_char(range_end, 'YYYY-MM-DD') AS e, photo_count AS c FROM suggestion_dismissals ORDER BY id`)
  return (r.rows ?? r).map((x: any) => ({ start: x.s, end: x.e, count: x.c }))
}

export async function addDismissal(userId: number, start: string, end: string, count: number): Promise<void> {
  await getDB().execute(sql`INSERT INTO suggestion_dismissals (range_start, range_end, photo_count, dismissed_by) VALUES (${start}::date, ${end}::date, ${count}, ${userId})`)
}
