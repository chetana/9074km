-- Index des photos/vidéos du coffre (lot 1b : métadonnées EXIF). Additif, idempotent, aucune table existante touchée.
-- taken_at = heure murale locale de prise de vue, SANS fuseau (taken_offset garde le décalage lu dans l'EXIF).
CREATE TABLE IF NOT EXISTS media (
  path text PRIMARY KEY,
  day date NOT NULL,
  kind text NOT NULL,
  size bigint,
  uploaded_by text,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  taken_at timestamp,
  taken_offset text,
  lat double precision,
  lng double precision,
  make text,
  model text,
  skipped_at timestamptz,
  deleted_at timestamptz,
  CONSTRAINT media_kind_chk CHECK (kind IN ('image', 'video')),
  CONSTRAINT media_lat_chk CHECK (lat IS NULL OR lat BETWEEN -90 AND 90),
  CONSTRAINT media_lng_chk CHECK (lng IS NULL OR lng BETWEEN -180 AND 180)
);
CREATE INDEX IF NOT EXISTS media_day_idx ON media (day DESC);
