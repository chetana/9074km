import { pgTable, serial, text, timestamp, integer, boolean, date, index, check, bigint, doublePrecision } from 'drizzle-orm/pg-core'
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

// Index des photos/vidéos (lot 1b). Miroir de scripts/sql/002-media.sql ; taken_at = heure murale locale sans fuseau.
export const media = pgTable('media', {
  path: text('path').primaryKey(),
  day: date('day', { mode: 'string' }).notNull(),
  kind: text('kind').notNull(),
  size: bigint('size', { mode: 'number' }),
  uploadedBy: text('uploaded_by'),
  uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
  takenAt: timestamp('taken_at', { mode: 'string' }),
  takenOffset: text('taken_offset'),
  lat: doublePrecision('lat'),
  lng: doublePrecision('lng'),
  make: text('make'),
  model: text('model'),
  skippedAt: timestamp('skipped_at', { withTimezone: true }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  check('media_kind_chk', sql`${t.kind} IN ('image', 'video')`),
  index('media_day_idx').on(t.day.desc()),
])

// Suggestions écartées (lot 4). Miroir de scripts/sql/003-suggestions.sql.
export const suggestionDismissals = pgTable('suggestion_dismissals', {
  id: serial('id').primaryKey(),
  rangeStart: date('range_start', { mode: 'string' }).notNull(),
  rangeEnd: date('range_end', { mode: 'string' }).notNull(),
  photoCount: integer('photo_count').notNull(),
  dismissedBy: integer('dismissed_by').references(() => users.id),
  dismissedAt: timestamp('dismissed_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check('suggestion_dismissals_count_chk', sql`${t.photoCount} >= 0`),
  index('suggestion_dismissals_range_idx').on(t.rangeStart, t.rangeEnd),
])
