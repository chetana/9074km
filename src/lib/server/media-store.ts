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

export interface UnclassifiedItem { path: string; day: string; kind: 'image' | 'video'; size: number | null }

// « À classer » : ni supprimée, ni ignorée, et rattachée à aucun évènement vivant.
const UNCLASSIFIED = sql`m.deleted_at IS NULL AND m.skipped_at IS NULL AND NOT EXISTS (
  SELECT 1 FROM event_media e JOIN events ev ON ev.id = e.event_id AND ev.deleted_at IS NULL WHERE e.media_path = m.path)`

export async function countUnclassified(): Promise<number> {
  const r: any = await getDB().execute(sql`SELECT count(*)::int AS n FROM media m WHERE ${UNCLASSIFIED}`)
  return (r.rows ?? r)[0].n
}

/** Page de photos à classer, jour décroissant puis chemin décroissant (curseur à clé composite). */
export async function listUnclassified(limit: number, cursor: { day: string; path: string } | null): Promise<UnclassifiedItem[]> {
  const after = cursor ? sql`AND (m.day, m.path) < (${cursor.day}::date, ${cursor.path})` : sql``
  const r: any = await getDB().execute(sql`
    SELECT m.path, m.day::text AS day, m.kind, m.size FROM media m
    WHERE ${UNCLASSIFIED} ${after}
    ORDER BY m.day DESC, m.path DESC LIMIT ${limit}`)
  return (r.rows ?? r).map((x: any) => ({ path: x.path, day: x.day, kind: x.kind, size: x.size === null ? null : Number(x.size) }))
}
