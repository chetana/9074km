# CLAUDE.md — chet_lys

## Workflow de déploiement (OBLIGATOIRE)

Après chaque modification du code source Flutter, le workflow complet est :

```bash
flutter build web --release
git add build/web lib/...   # ← toujours inclure build/web
git commit -m "..."
git push
npx vercel --prod
```

**Ne jamais committer uniquement les fichiers `lib/` sans rebuilder et committer `build/web`.**
`build/web` est le seul artefact de build commité (Vercel ne peut pas compiler Flutter côté serveur).
Si `build/web` est désynchronisé avec les sources, la PWA déployée est en retard sur le code.

Un hook `pre-push` vérifie automatiquement que `build/web` est à jour (voir `.git/hooks/pre-push`).

---

## Stack

- **Flutter** (Puro) : `~/.puro/envs/stable/flutter/bin/flutter.bat`
- **Backend** : `C:\Users\cheta\chetana-dev` — Nuxt 3, déployé sur `chetana.dev`
- **Hosting PWA** : Vercel → `chetlys.vercel.app`

---

## Commits

- Pas de `Co-Authored-By: Claude` — auteur unique uniquement
- Pas de `build/web` seul — toujours accompagné des sources modifiées (ou commit `build:` dédié)
