# Tests E2E (Playwright)

## Deux projets, deux serveurs

- `chromium` (Desktop Chrome) : smoke tests et specs coffre, serveur dev `5173`, aucune session.
- `iphone-14-pro` : Chromium en émulation mobile (393×852 posé explicitement, @3x, tactile, UA iPhone). Ce n'est
  PAS WebKit (non installé) : bonne approximation des tailles et du tactile, pas du rendu Safari. Il rejoue les
  specs `coffre-*` sans changer leur logique, plus `coffre-measure` et `shots-coffre` (iPhone seulement).
- Workers limités à 2 (`playwright.config.ts`) : avec le défaut, les deux serveurs Vite dev saturent et des specs expirent.
- `npm run test:e2e` lance les deux ; `npm run test:e2e:iphone` seulement l'iPhone.

## Bypass d'auth DEV-ONLY (`E2E_AUTH_USER`)

Le second serveur (`5174`) démarre avec `E2E_AUTH_USER` (JSON `{id,email,name,picture}` ou simple nom) : le hook
`devAuth` (`src/lib/server/dev-auth.ts`) injecte alors `locals.dbUser`, la vraie pile SvelteKit tourne sans Logto.
Ce serveur reçoit aussi `DATABASE_URL` et un S3 injoignables (`127.0.0.1:1`, bucket factice) : toute requête non
interceptée échoue, rien ne peut toucher la prod. Les API sont mockées par `e2e/support/coffre-mocks.ts`.

Garde POSITIF (`dev-auth.ts`) : actif seulement si `dev` (SvelteKit, figé au build) vaut true ET `NODE_ENV` vaut
exactement `development` ET la variable est définie et valide. NODE_ENV absent, `production`, `Production`, `test` :
inerte. Défense en profondeur : le Dockerfile pose `ENV NODE_ENV=production` dans l'étage runtime ; `deploy.sh`
refuse de déployer si NODE_ENV est défini et différent de `production`, et abandonne avant le push si l'image
contient `const dev = true` dans `build/server` ou si NODE_ENV de l'image n'est pas `production`. Le serveur 5174
de Playwright pose `NODE_ENV=development` explicitement (`webServer.env`). Tests : `dev-auth.test.ts` (matrice
du garde, vrai `hooks.server.ts` monté, scan : variable référencée seulement dans `hooks.server.ts` et `dev-auth.ts`).
Ne jamais définir `E2E_AUTH_USER` dans `infra/box/env/*.env`.

Scénarios réels mesurés (`node build`, `E2E_AUTH_USER=Pirate`, base/S3 factices) :

| Build | NODE_ENV au runtime | `/api/coffre/events` | `/coffre/__data.json` user |
|---|---|---|---|
| normal (`const dev = false`) | absent | 401 | null |
| normal | production | 401 | null |
| normal | development | 401 | null |
| `NODE_ENV=development npm run build` (`const dev = true`) | absent | 401 | null |
| idem | production | 401 | null |
| idem | development | passe l'auth (500 : base factice injoignable) | Pirate |
| image Docker (`docker build` + `docker run`) | production (ENV de l'image) | 401 | null |

Seule la dernière combinaison dev-build + NODE_ENV=development active le bypass ; le Dockerfile l'interdit
(NODE_ENV=production figé) et `deploy.sh` refuse un build en mode dev. Le build de prod ne contient jamais la
variable côté client (`.svelte-kit/output/client`).

## Captures et mesures

- `SHOTS_DIR=/chemin npm run shots:coffre` : 14 écrans (Dates, Évènements, picker, fiche, upload, suggestion,
  tri, export, viewer) avec zones sûres simulées (CDP `Emulation.setSafeAreaInsetsOverride`, haut 59 / bas 34).
  Hors du dépôt (défaut `/tmp/lys-coffre-shots`).
- `coffre-measure.spec.ts` : par écran, cibles tactiles ≥ 44 px, khmer ≥ 13 px (≥ 18 px sur actions primaires),
  pas de scroll horizontal, rien d'interactif fixe dans la zone non sûre. Allowlist dans le fichier.
- `npm run build && npm run check:bundle` : bundle initial du coffre (gzip) ≤ référence +15 %
  (`scripts/bundle-budget.json`, `--update` pour réétalonner volontairement).
- Limites : Chromium ≠ Safari ; Dynamic Island et safe areas simulées, pas réelles ; swipe simulé à la souris.

## Smoke tests historiques

Volontairement une poignée de tests, pas une suite E2E complète. Lancés à la main avant un déploiement qui touche
le layout, l'auth-gate ou le service worker, pas dans `deploy.sh`. Sans session, ils couvrent la gate d'auth et
les deux exceptions publiques (partage coffre, galerie fiançailles).

Chaque test cible un bug réel trouvé le 22/09/2026 :
- `auth-gate.spec.ts` — la redirection silencieuse vers `/api/auth/sign-in` repose sur une
  comparaison de `pathname`/query params fragile (`isCoffreShare`, `isPublicGallery`) ; une
  régression y casserait soit l'auth (fuite d'accès), soit le partage public (redirection à tort).
- `nav-dock.spec.ts` — le nav-dock a peint invisible pendant tout le refactor pastel car il lui
  manquait `position: relative; z-index: 1` (peignait sous `Sky.svelte`, `position: fixed;
  z-index: 0`). Aucun log n'expliquait le symptôme.
- `pwa-version-check.spec.ts` — le cycle reload-au-changement-de-version doit se déclencher une
  fois, jamais boucler (garde-fou `sessionStorage.updatedTo`).
