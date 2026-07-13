import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { env } from '$env/dynamic/private'

// Scaleway Serverless SQL (et Neon) via node-postgres.
// search_path forcé à public : Serverless SQL a un search_path vide par défaut.
let _db: ReturnType<typeof drizzle> | null = null
let _pool: Pool | null = null

export function getDB() {
  if (!_db) {
    _pool = new Pool({ connectionString: env.DATABASE_URL!, max: 3 })
    _pool.on('connect', (client) => { client.query('SET search_path TO public') })
    _db = drizzle(_pool)
  }
  return _db
}
