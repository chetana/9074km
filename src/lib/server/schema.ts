import { pgTable, serial, text, timestamp, integer, boolean, date, index, check } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name'),
  picture: text('picture'),
  googleId: text('google_id').unique(),
  logtoId: text('logto_id').unique(),
  createdAt: timestamp('created_at').defaultNow(),
  lastLoginAt: timestamp('last_login_at').defaultNow(),
})

// Évènements du coffre. Miroir de scripts/sql/001-events.sql (exécuté par ensureCoffreSchema).
export const events = pgTable('events', {
  id: serial('id').primaryKey(),
  nameFr: text('name_fr').notNull(),
  nameEn: text('name_en').notNull(),
  nameKh: text('name_kh').notNull(),
  nameSrcLang: text('name_src_lang').notNull(),
  namesPending: boolean('names_pending').notNull().default(false),
  dateStart: date('date_start', { mode: 'string' }).notNull(),
  dateEnd: date('date_end', { mode: 'string' }).notNull(),
  coverPath: text('cover_path'),
  place: text('place'),
  emoji: text('emoji'),
  color: text('color').notNull().default('accent'),
  autoAttach: boolean('auto_attach').notNull().default(true),
  version: integer('version').notNull().default(1),
  createdBy: integer('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  check('events_range_chk', sql`${t.dateEnd} >= ${t.dateStart} AND ${t.dateEnd} - ${t.dateStart} <= 366`),
  check('events_src_lang_chk', sql`${t.nameSrcLang} IN ('fr', 'en', 'kh')`),
  index('events_date_start_idx').on(t.dateStart.desc()),
  index('events_deleted_at_idx').on(t.deletedAt),
])

// Une photo appartient à 0 ou 1 évènement (PK sur media_path).
export const eventMedia = pgTable('event_media', {
  mediaPath: text('media_path').primaryKey(),
  eventId: integer('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  addedBy: integer('added_by').references(() => users.id),
  addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('event_media_event_id_idx').on(t.eventId),
])
