-- Évènements du coffre (lot 0). Idempotent, non destructif : aucune table existante touchée.
-- Une instruction par bloc terminé par un point-virgule en fin de ligne (découpage par coffre-db.ts).
CREATE TABLE IF NOT EXISTS events (
  id serial PRIMARY KEY,
  name_fr text NOT NULL,
  name_en text NOT NULL,
  name_kh text NOT NULL,
  name_src_lang text NOT NULL,
  names_pending boolean NOT NULL DEFAULT false,
  date_start date NOT NULL,
  date_end date NOT NULL,
  cover_path text,
  place text,
  emoji text,
  color text NOT NULL DEFAULT 'accent',
  auto_attach boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1,
  created_by integer NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT events_range_chk CHECK (date_end >= date_start AND date_end - date_start <= 366),
  CONSTRAINT events_src_lang_chk CHECK (name_src_lang IN ('fr', 'en', 'kh'))
);
CREATE INDEX IF NOT EXISTS events_date_start_idx ON events (date_start DESC);
CREATE INDEX IF NOT EXISTS events_deleted_at_idx ON events (deleted_at);
CREATE TABLE IF NOT EXISTS event_media (
  media_path text PRIMARY KEY,
  event_id integer NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  added_by integer REFERENCES users(id),
  added_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS event_media_event_id_idx ON event_media (event_id);
