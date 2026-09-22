---
name: pre-deploy
description: Checklist d'auto-vérification avant de déclarer un changement "fini" sur lys — à lancer avant /deploy
allowed-tools: Bash, Read
---

# Pre-deploy — checklist d'auto-vérification

Pas un agent, pas une gate automatique — une liste de questions à se poser soi-même avant de dire
"c'est prêt" ou d'appeler `/deploy`. Chaque question vient d'un bug ou d'un oubli réel de ce repo
(voir CLAUDE.md pour le détail de chaque incident).

Répondre à chaque question qui s'applique. Si une réponse est non, corriger avant de continuer —
ne pas déployer "pour voir".

## Toujours

- [ ] `npm run check` → 0 erreur (les warnings a11y connus ne bloquent pas)
- [ ] `npm run test` (vitest) → tout passe
- [ ] Le déploiement se fait via `bash deploy.sh` (jamais un tag Docker manuel `*-test`)

## Si `src/lib/server/vertex.ts`, `glm.ts` ou `khmer-guards.ts` a changé

- [ ] `npm run eval:translate` lancé — les 7 cas de régression connus passent toujours
      (glossaire, "il faut que", "mes parents", inversion de sens, corruption)
- [ ] Un mot ajouté au glossaire ne l'a été qu'à UN endroit (`GLOSSARY_LINES` dans
      `khmer-guards.ts`) — jamais dupliqué dans un prompt à côté
- [ ] Si le schéma JSON de sortie a changé : l'ordre des clés reste `lang → terms → en → kh → fr`
      (le modèle doit s'engager sur `terms` avant de rédiger)

## Si `+layout.svelte`, `Sky.svelte` ou `app.css` a changé (CSS global, dock, header)

- [ ] Vérifié visuellement (Chrome/DevTools ou capture d'écran réelle) — pas juste "ça a l'air
      bon dans le code". `Sky.svelte` est `position:fixed;z-index:0` : tout élément qui doit
      rester lisible par-dessus a besoin de son propre `position:relative`+`z-index` explicite
      (piège vécu sur le nav-dock, invisible pendant tout un refactor sans qu'aucun log ne
      l'explique)
- [ ] `npx playwright test e2e/nav-dock.spec.ts` passe

## Si la logique d'auth-gate a changé (`+layout.svelte` : redirect silencieux, exceptions
coffre share / `/fiancailles`)

- [ ] `npx playwright test e2e/auth-gate.spec.ts` passe — dans les deux sens (pas de fuite
      d'accès, pas de redirection à tort d'un lien public)

## Si une route API publique a été ajoutée ou son paramètre `path`/`prefix` a changé

- [ ] Le path est validé contre un format précis (voir `coffre-path.ts` : `^\d{4}/\d{2}/\d{2}/[^/]+$`)
      — jamais un `path` libre passé tel quel à S3 (delete/sign-download/og-image l'ont tous fait
      jusqu'au 22/09/2026, avec `og-image` PUBLIC SANS AUTH en plus)
- [ ] La route passe par `rateLimit` (`hooks.server.ts`) — vérifier qu'elle n'est pas sous
      `/_app/` (seule exclusion) et qu'aucun contournement n'a été ajouté

## Avant de committer

- [ ] Message de commit : sujet court, une ligne, sans `Co-Authored-By` (convention perso —
      auteur unique sur ce repo)
- [ ] `git status` relu — rien d'inattendu dans les fichiers stagés (pas de `.env`, pas de
      `test-results/`)
