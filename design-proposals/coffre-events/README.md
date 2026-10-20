# Évènements du coffre — avant de déployer

`deploy.sh` ne lance pas le test d'intégration Postgres (il est ignoré sans `TEST_PG_URL`). À lancer à la main avant un déploiement qui touche `events-store.ts`, `coffre-db.ts` ou `scripts/sql/` :

```bash
docker run -d --rm --name lys-pg -e POSTGRES_PASSWORD=t -e POSTGRES_DB=t -p 54329:5432 postgres:16-alpine
TEST_PG_URL=postgres://postgres:t@127.0.0.1:54329/t npx vitest run
docker rm -f lys-pg
```

Le test refuse toute URL qui n'est pas `localhost`/`127.0.0.1` et vide les tables `events`/`event_media` : base jetable uniquement, jamais celle de la chetbox.

## Rétro-indexation des photos existantes (lot 2)

`scripts/index-coffre-media.mjs` remplit la table `media` avec les photos/vidéos déjà dans S3 (jamais de ligne existante modifiée, relançable). Toujours commencer par le dry-run, qui n'écrit rien :

```bash
node --experimental-strip-types scripts/index-coffre-media.mjs            # dry-run (défaut)
node --experimental-strip-types scripts/index-coffre-media.mjs --apply    # écrit, par lots de 500
# options : --limit N (N fichiers) · --year AAAA
```

Variables lues dans l'environnement puis `.env` : `DATABASE_URL`, `GCS_BUCKET_NAME`, `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` (aucune valeur n'est affichée). `uploaded_at` = LastModified S3 (informatif, jamais une date de prise de vue). Le rapport se termine par « À classer (sans évènement) : N ».

