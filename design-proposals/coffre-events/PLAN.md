# Coffre — évènements (plan d'architecte condensé, 2026-10-20)

Objectif : taguer/regrouper les photos du coffre par ÉVÈNEMENT (ex. « Disneyland Paris » le 30/11/2026) en plus de la vue par DATE, qui reste strictement inchangée (dossiers S3 `YYYY/MM/DD/`, previews `og-image`). iPhone 14 Pro d'abord (393×852), khmer d'abord (Lys, français A1), réseau lent, pas de push, pas d'IA payante par photo.

## Décisions (validées par Chetana)
- Évènement = objet de 1re classe : nom fr/en/km (saisi dans une langue, traduit UNE fois à la création/renommage via `geminiTranslateAll` — GLM ClinePass —, plafonds 20/min/utilisateur et 200/jour, repli : nom source dans les 3 langues + `names_pending`), dates calendaires début/fin (sans fuseau), couverture, lieu, emoji, couleur (6 tokens pastel existants), `auto_attach`, `version` (concurrence optimiste).
- UNE photo → 0 ou 1 évènement (PK sur `media_path`) ; pas d'imbrication ; pas de tags libres.
- Stockage : Postgres local de la chetbox (drizzle/pg déjà présents : src/lib/server/schema.ts, db.ts). S3 reste la vérité des fichiers. JSON-sur-S3 écarté (écritures concurrentes non atomiques, déjà un défaut sur meta.json).
- Entrée UI : sélecteur segmenté « Dates | Évènements » à la racine du coffre (`/coffre?v=events`), pas de 5e onglet.
- Tests e2e : bypass d'auth dev-only autorisé (variable d'env absente en prod + test unitaire qui prouve que la prod ne la lit jamais).

## Schéma (src/lib/server/schema.ts, migration idempotente via ensureCoffreSchema)
- `events` : id serial PK, name_fr/name_en/name_kh text, name_src_lang ('fr'|'en'|'kh'), names_pending bool default false, date_start date, date_end date (CHECK date_end >= date_start AND date_end - date_start <= 366), cover_path text null, place text null, emoji text null, color text default 'accent', auto_attach bool default true, version int default 1, created_by int FK users.id, created_at, updated_at, deleted_at null. Index (date_start desc), (deleted_at).
- `event_media` : media_path text PK (format `YYYY/MM/DD/fichier`, validé par isValidCoffrePath), event_id int FK events.id ON DELETE CASCADE, added_by int, added_at. Index (event_id).
- (lot 2) `media`, `suggestion_dismissals`.
- Migration NON destructive : `scripts/sql/001-events.sql` (CREATE TABLE IF NOT EXISTS …) + `ensureCoffreSchema()` dans src/lib/server/coffre-db.ts, exécuté une fois par process au premier appel d'une route évènements. Rien n'est écrit dans S3.

## API (toutes sous requireAuth ; rate-limit global existant + plafonds dédiés ; validation stricte via src/lib/server/events-validate.ts pur et testé, pas de nouvelle dépendance)
- GET /api/coffre/events (`?year=&place=`) → {events:[{id,names,dates,cover,place,emoji,color,count,upcoming}]}, no-store.
- POST /api/coffre/events {name,dateStart,dateEnd,place?,emoji?,color?,autoAttach?,mediaPaths?} (nom 1–80, lieu ≤ 120, emoji ≤ 8 cp, mediaPaths ≤ 500 valides ; 30 créations/h/utilisateur) → {event} ; traduction asynchrone côté serveur.
- PATCH /api/coffre/events/:id {ifVersion,…} → {event} ou 409 {current} ; retraduction seulement si name change.
- DELETE /api/coffre/events/:id (soft delete ; les photos restent dans la vue Dates).
- POST/DELETE /api/coffre/events/:id/media {paths} (≤ 500 ; INSERT … ON CONFLICT (media_path) DO UPDATE SET event_id = déplacement) ; GET /api/coffre/events/:id/media.
- GET /api/coffre/events/for-date?d=YYYY-MM-DD (évènements couvrant la date, auto_attach d'abord).

## UX lot 1 (wireframes détaillés dans le message d'architecte ; résumé)
- Sélecteur « Dates | Évènements » (44 px) sous l'en-tête du coffre ; la vue Dates est inchangée.
- Vue Évènements : recherche locale, chips année/lieu, grille 2 colonnes de couvertures 4:5 (nom dans la langue du lecteur 18 px + 2e langue 14 px, date, nombre), séparateurs de mois, évènements à venir en tête (voile crème + badge « À venir · នឹងមកដល់ »), états vide/chargement/erreur/hors-ligne (cache localStorage `lys_cache_events`, mutations refusées avec toast).
- Vue d'un évènement : en-tête 16:9 (couverture sur voile crème lisible, titre, dates, lieu, compte), un fil par jour, grille 3 colonnes, FileTile/FileViewer réutilisés (+ pastille « Dans : … »), menu ⋯ (modifier / couverture / supprimer), sélection par appui long : « Retirer », « Déplacer vers… », « Couverture ».
- Tagging depuis la vue jour : bouton « Ajouter à… » dans la barre de sélection (DayFiles) → BottomSheet « Choisir un évènement » (suggérés = évènements couvrant la date, puis récents, + « Nouvel évènement » à la volée, nom pré-rempli avec la date), toast + pastille sur les tuiles.
- Fiche création/édition (BottomSheet pleine hauteur) : nom (langue libre) → 3 langues éditables après enregistrement, dates (input date), lieu, emoji (6 raccourcis + champ libre), couleur (6 tokens), auto_attach ; suppression avec toast Annuler 5 s (requête envoyée à l'expiration).
- Accessibilité : libellés FR + khmer (`lang="km"`, jamais italique, ≥ 18 px sur noms/actions primaires), contraste (--accent-text), aria-label, zones sûres (Dynamic Island, barre d'accueil), transitions courtes seulement, aucune animation infinie.

## Lots
0 Socle (schema, ensureCoffreSchema, events-validate, pagination ContinuationToken dans gcs.ts getFiles + test) · 1 MVP (routes + UI ci-dessus) · 2 index média + upload « Cet envoi : [évènement ▾] » · 3 fiche/polish/export · 4 suggestions + mode tri · 5 projet Playwright iPhone 14 Pro + bypass auth dev · 6 EXIF + cache miniatures (optionnel).
Règles : ne jamais utiliser LastModified S3 (UTC) comme date de prise de vue ; la date reste la date murale locale.
