import { sql } from 'drizzle-orm'
import { getDB } from './db'
import EVENTS_SQL from '../../../scripts/sql/001-events.sql?raw'
import MEDIA_SQL from '../../../scripts/sql/002-media.sql?raw'
import SUGGESTIONS_SQL from '../../../scripts/sql/003-suggestions.sql?raw'

/** Instructions SQL d'un fichier de migration : une par bloc terminé par `;` en fin de ligne. */
export function splitSqlStatements(text: string): string[] {
  return text
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n')
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export const COFFRE_MIGRATIONS = [EVENTS_SQL, MEDIA_SQL, SUGGESTIONS_SQL]

let ready: Promise<void> | null = null

/** Crée les tables si besoin, une seule fois par process (promesse mémorisée, rejouée après échec). */
export function ensureCoffreSchema(): Promise<void> {
  if (!ready) {
    ready = run().catch((e) => {
      ready = null
      throw e
    })
  }
  return ready
}

async function run(): Promise<void> {
  const db = getDB()
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(907401)`)
    for (const text of COFFRE_MIGRATIONS) {
      for (const stmt of splitSqlStatements(text)) await tx.execute(sql.raw(stmt))
    }
  })
}

export function resetCoffreSchemaForTests(): void {
  ready = null
}
