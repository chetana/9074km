---
name: deploy
description: Déploie lys (chet_lys) sur chetbox (instance Scaleway always-on) via ./deploy.sh
allowed-tools: Bash, WebFetch, Read
---

# Deploy lys (chet_lys) → chetbox

lys tourne sur **chetbox** : instance Scaleway DEV1-M always-on (`163.172.7.239`, fr-par-1), docker compose `/opt/chet`, Caddy + Cloudflare devant. Domaine `lys.chetana.fr`.
**Plus sur Scaleway Serverless Container** (supprimé lors de la migration 13/09/2026 — l'ancien container `dd100faa...` n'existe plus). Pas d'auto-deploy sur push — le déploiement se fait avec `deploy.sh`.

## Déployer

```bash
bash deploy.sh          # bump version → build → push registry → pull/up sur la box → vérifie /api/version
bash deploy.sh --dry    # teste juste le prochain numéro de version, sans rien déployer
```

`deploy.sh` fait tout :
1. **Bump `APP_VERSION`** (patch +1) dans `src/lib/version.ts` — le tag de l'image = ce numéro (source de vérité unique, visible via `/api/version` et le suivi in-app).
2. **Build** Docker (`--context default` car le socket Docker est parfois mort).
3. **Push** sur `rg.fr-par.scw.cloud/chetana-apps/lys:<version>`.
4. **Sur la box** (ssh `root@163.172.7.239`, clé `~/.ssh/chetbox`) : bump du tag dans `/opt/chet/compose.yml` → `docker compose pull lys` → `up -d lys`.
5. **Vérifie** que `https://lys.chetana.fr/api/version` renvoie bien la nouvelle version.
6. **Commit + push** le bump de `version.ts` (auteur perso, sans Co-Authored-By).

## Important
- Branche : `master`. Repo : `chetana/9074km`.
- La DB est la **postgres locale de la box** (`postgres:5432/chetana-portfolio`, env `/opt/chet/env/lys.env`) — PAS la Serverless SQL Scaleway `b8f50b52...` (supprimée ; elle causait des 500 intermittents jusqu'au 20/09/2026).
- Rollback : repasser le tag dans `/opt/chet/compose.yml` (ou via git revert du bump) puis `bash deploy.sh` avec la version voulue en éditant `version.ts` à la main.
- Runbook complet de la box : `~/Chetana/chet-workspace/infra/box/README.md`.
