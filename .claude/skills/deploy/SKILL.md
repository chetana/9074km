---
name: deploy
description: Déploie lys (chet_lys) sur Scaleway Serverless Container via ./deploy.sh
allowed-tools: Bash, WebFetch, Read
---

# Deploy lys (chet_lys) → Scaleway

lys tourne sur un **Scaleway Serverless Container** (`fr-par`, scale-to-zero), domaine `lys.chetana.fr`.
**Plus sur Vercel/Cloud Run.** Pas d'auto-deploy sur push — le déploiement se fait avec `deploy.sh`.

## Déployer

```bash
bash deploy.sh          # bump version → build → push → update image → deploy → vérifie /api/version
bash deploy.sh --dry    # teste juste le prochain numéro de version, sans rien déployer
```

`deploy.sh` fait tout :
1. **Bump `APP_VERSION`** (patch +1) dans `src/lib/version.ts` — le tag de l'image = ce numéro (source de vérité unique, visible via `/api/version` et le suivi in-app).
2. **Build** Docker (`--context default` car le socket Docker Desktop meurt parfois).
3. **Push** sur `rg.fr-par.scw.cloud/chetana-apps/lys:<version>`.
4. **Update image + deploy** le container `dd100faa-e213-4fbf-a81e-d14950b665f2` (ne passe QUE `image=` → env/secrets préservés).
5. **Vérifie** que `https://lys.chetana.fr/api/version` renvoie bien la nouvelle version.
6. **Commit + push** le bump de `version.ts` (auteur perso, sans Co-Authored-By).

## Important
- Branche : `master`. Repo : `chetana/9074km`.
- Rollback : `scw container container update <CID> image=rg.fr-par.scw.cloud/chetana-apps/lys:<ancienne-version>` puis `deploy`.
- Le container préserve ses secrets tant qu'on ne passe pas `secret-environment-variables` (voir mémoire migration Scaleway pour les pièges).
