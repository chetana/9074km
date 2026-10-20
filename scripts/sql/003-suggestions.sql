-- Suggestions d'évènements écartées (lot 4). Additif, idempotent. Partagé entre Chet et Lys (pas de clé par utilisateur).
-- photo_count = nombre de photos de la plage au moment du refus : la suggestion réapparaît si elle grossit de >= 50 %.
CREATE TABLE IF NOT EXISTS suggestion_dismissals (
  id serial PRIMARY KEY,
  range_start date NOT NULL,
  range_end date NOT NULL,
  photo_count integer NOT NULL,
  dismissed_by integer REFERENCES users(id),
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT suggestion_dismissals_range_chk CHECK (range_end >= range_start AND range_end - range_start <= 366),
  CONSTRAINT suggestion_dismissals_count_chk CHECK (photo_count >= 0)
);
CREATE INDEX IF NOT EXISTS suggestion_dismissals_range_idx ON suggestion_dismissals (range_start, range_end);
