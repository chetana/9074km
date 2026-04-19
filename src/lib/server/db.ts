import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { env } from '$env/dynamic/private'

let _db: ReturnType<typeof drizzle> | null = null

export function getDB() {
  if (!_db) {
    const sql = neon(env.DATABASE_URL!)
    _db = drizzle(sql)
  }
  return _db
}
