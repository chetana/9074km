#!/usr/bin/env bash
# Déploiement lys → Scaleway Serverless Container.
# Bump APP_VERSION (+1 patch) → build → push → update image → deploy → vérifie /api/version.
# Le tag de l'image = le numéro de version (source de vérité unique).
# Usage : bash deploy.sh        déploie
#         bash deploy.sh --dry  teste juste le bump (n'écrit rien, ne déploie rien)
set -euo pipefail
cd "$(dirname "$0")"

CID=dd100faa-e213-4fbf-a81e-d14950b665f2
REG=rg.fr-par.scw.cloud/chetana-apps/lys
URL=https://lys.chetana.fr
DRY=${1:-}
[ "$DRY" = "--dry" ] && DRYENV=1 || DRYENV=0

# 1. Bump version.ts (patch +1) — n'écrit que si pas en dry-run
VER=$(DRY=$DRYENV node -e '
  const fs=require("fs"); const p="src/lib/version.ts";
  const c=fs.readFileSync(p,"utf8");
  const m=c.match(/APP_VERSION\s*=\s*["\x27](\d+)\.(\d+)\.(\d+)["\x27]/);
  if(!m){console.error("APP_VERSION introuvable dans "+p);process.exit(1);}
  const next=m[1]+"."+m[2]+"."+(Number(m[3])+1);
  if(process.env.DRY!=="1"){
    fs.writeFileSync(p,"// Bump patch +1 a chaque deploiement (via deploy.sh).\nexport const APP_VERSION = \x27"+next+"\x27;\n");
  }
  process.stdout.write(next);
')
echo "→ nouvelle version : $VER"
[ "$DRY" = "--dry" ] && { echo "(dry-run : version.ts inchangé, rien de déployé)"; exit 0; }

# 2. Build (--context default : le socket Docker Desktop est parfois mort)
echo "→ build $REG:$VER"
docker --context default build -t "$REG:$VER" .

# 3. Push
echo "→ push"
docker --context default push "$REG:$VER"

# 4. Update image + deploy (préserve env/secrets : on ne passe QUE image=)
echo "→ deploy Scaleway"
scw container container update "$CID" image="$REG:$VER" >/dev/null
scw container container deploy "$CID" >/dev/null

# 5. Attendre ready + vérifier la version réellement servie
st=""
for i in $(seq 1 40); do
  st=$(scw container container get "$CID" -o json | node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(0)).status)')
  [ "$st" = "ready" ] && break
  sleep 6
done
echo "→ container : $st"
served=$(curl -s "$URL/api/version" | node -e 'try{process.stdout.write(JSON.parse(require("fs").readFileSync(0)).version)}catch(e){process.stdout.write("?")}')
echo "→ /api/version : $served"

# 6. Commit + push le bump de version (auteur perso, sans Co-Authored-By)
git add src/lib/version.ts
git -c user.email=chetana.yin@gmail.com commit -m "deploy lys $VER" >/dev/null 2>&1 || true
git push origin HEAD >/dev/null 2>&1 || true

[ "$served" = "$VER" ] && echo "✅ lys déployé en $VER" || echo "⚠️ version servie ($served) ≠ attendue ($VER) — à vérifier"
