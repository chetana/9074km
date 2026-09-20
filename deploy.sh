#!/usr/bin/env bash
# Déploiement lys → chetbox (instance Scaleway always-on, docker compose).
# Bump APP_VERSION (+1 patch) → build → push registry → pull/up sur la box → vérifie /api/version.
# Le tag de l'image = le numéro de version (source de vérité unique).
# Usage : bash deploy.sh        déploie
#         bash deploy.sh --dry  teste juste le bump (n'écrit rien, ne déploie rien)
set -euo pipefail
cd "$(dirname "$0")"

BOX=163.172.7.239
BOX_KEY=~/.ssh/chetbox
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

# 2. Build (--context default : le socket Docker est parfois mort)
echo "→ build $REG:$VER"
docker --context default build -t "$REG:$VER" .

# 3. Push
echo "→ push"
docker --context default push "$REG:$VER"

# 4. Sur la box : bump du tag compose + pull + up
echo "→ deploy chetbox"
ssh -i "$BOX_KEY" -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new root@"$BOX" bash -se <<REMOTE
set -euo pipefail
cd /opt/chet
sed -i "s|$REG:[^\"[:space:]]*|$REG:$VER|" compose.yml
grep -A1 "lys:" compose.yml | grep "$REG:"
docker compose pull lys 2>&1 | tail -1
docker compose up -d lys
REMOTE

# 5. Vérifier la version réellement servie
served=$(curl -s "$URL/api/version" | node -e 'try{process.stdout.write(JSON.parse(require("fs").readFileSync(0)).version)}catch(e){process.stdout.write("?")}')
echo "→ /api/version : $served"

# 6. Commit + push le bump de version (auteur perso, sans Co-Authored-By)
git add src/lib/version.ts
git -c user.email=chetana.yin@gmail.com commit -m "deploy lys $VER" >/dev/null 2>&1 || true
git push origin HEAD >/dev/null 2>&1 || true

[ "$served" = "$VER" ] && echo "✅ lys déployé en $VER sur chetbox" || echo "⚠️ version servie ($served) ≠ attendue ($VER) — à vérifier"
