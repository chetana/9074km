# Évènements du coffre — avant de déployer

`deploy.sh` ne lance pas le test d'intégration Postgres (il est ignoré sans `TEST_PG_URL`). À lancer à la main avant un déploiement qui touche `events-store.ts`, `coffre-db.ts` ou `scripts/sql/` :

```bash
docker run -d --rm --name lys-pg -e POSTGRES_PASSWORD=t -e POSTGRES_DB=t -p 54329:5432 postgres:16-alpine
TEST_PG_URL=postgres://postgres:t@127.0.0.1:54329/t npx vitest run
docker rm -f lys-pg
```

Le test refuse toute URL qui n'est pas `localhost`/`127.0.0.1` et vide les tables `events`/`event_media` : base jetable uniquement, jamais celle de la chetbox.
