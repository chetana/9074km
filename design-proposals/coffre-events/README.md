# Évènements du coffre — avant de déployer

`deploy.sh` ne lance pas le test d'intégration Postgres (il est ignoré sans `TEST_PG_URL`). À lancer à la main avant un déploiement qui touche `events-store.ts`, `coffre-db.ts` ou `scripts/sql/` :

```bash
docker run -d --rm --name lys-pg -e POSTGRES_PASSWORD=t -e POSTGRES_DB=t -p 54329:5432 postgres:16-alpine
TEST_PG_URL=postgres://postgres:t@127.0.0.1:54329/t npx vitest run
docker rm -f lys-pg
```

Le test refuse toute URL qui n'est pas `localhost`/`127.0.0.1` et vide les tables `events`/`event_media` : base jetable uniquement, jamais celle de la chetbox.

## Tests Postgres : pas en parallèle

Les fichiers `*.pg.test.ts` partagent une seule base : ils ne doivent PAS tourner en parallèle (collisions constatées). `vite.config.ts` le configure déjà (`test.fileParallelism: false`), donc `npx vitest run` suffit ; si vous lancez un runner à la main, ajoutez `--no-file-parallelism`.

## Rétro-indexation des photos existantes (lot 2)

`scripts/index-coffre-media.mjs` remplit la table `media` avec les photos/vidéos déjà dans S3 (jamais de ligne existante modifiée, relançable). Le dry-run, qui n'écrit rien, vient toujours en premier. `--apply` est **atomique** : tout tient dans UNE transaction (un savepoint par lot de 500, un seul COMMIT), la moindre erreur annule tout ; il exige `--yes` (ou `CONFIRM=1`).

```bash
node --experimental-strip-types scripts/index-coffre-media.mjs                  # dry-run (défaut)
node --experimental-strip-types scripts/index-coffre-media.mjs --apply --yes    # écrit (atomique)
# options : --limit N (N fichiers retenus ; compteurs d'ignorés alors PARTIELS) · --year AAAA
```

Variables lues dans l'environnement puis `.env` : `DATABASE_URL`, `GCS_BUCKET_NAME`, `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`. Chaque exécution affiche en tête le mode, le bucket, l'endpoint et `hôte:port/base` (jamais d'identifiants). `uploaded_at` = LastModified S3 (informatif, jamais une date de prise de vue). Le rapport signale les `meta.json` illisibles (une nouvelle tentative, puis comptés ; `uploaded_by` reste vide) et se termine par « À classer (sans évènement) : N ».

### Séquence prod (lot 2)

1. **Sauvegarde** de la base (par ex. `pg_dump` du Postgres de la chetbox) avant tout.
2. **Point de retour** : `CREATE TABLE IF NOT EXISTS media_before_lot2 AS SELECT path FROM media;` (si la table `media` n'existe pas encore, lancer d'abord le déploiement du lot 1b : `ensureCoffreSchema` la crée).
3. **Dry-run** : relire les totaux par année/mois, photos/vidéos, ignorés, « à classer ».
4. **Apply** : `... --apply --yes` (atomique) ; un 2e passage doit afficher 0 insertion.
5. **Vérifications** : `SELECT count(*), count(*) FILTER (WHERE kind = 'video') FROM media;` · comparer au total du dry-run · ouvrir la vue Évènements : le chip « N à classer » doit afficher le « À classer » du rapport.
6. **Retour arrière** (seulement les lignes que le script a ajoutées et qu'aucun évènement n'utilise) :
   `DELETE FROM media WHERE path NOT IN (SELECT path FROM media_before_lot2) AND path NOT IN (SELECT media_path FROM event_media);`
   puis `DROP TABLE media_before_lot2;` une fois tout validé.
