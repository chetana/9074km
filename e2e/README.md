# Smoke tests (Playwright)

Volontairement une poignée de tests, pas une suite E2E complète. Lancés à la main
(`npm run test:e2e`) avant un déploiement qui touche le layout, l'auth-gate ou le service worker —
pas dans `deploy.sh` (trop lent/fragile pour bloquer un déploiement solo).

Aucun mécanisme de mock d'auth Logto n'existe : les tests couvrent uniquement les parcours
accessibles sans session (gate d'auth elle-même, et les deux exceptions publiques — partage coffre
et galerie fiançailles). Un test de parcours authentifié (ex. envoi d'un message chat) demanderait
d'abord un cookie de session de test — pas fait ici, à ajouter si un bug d'auth réapparaît côté
route protégée.

Chaque test cible un bug réel trouvé le 22/09/2026 :
- `auth-gate.spec.ts` — la redirection silencieuse vers `/api/auth/sign-in` repose sur une
  comparaison de `pathname`/query params fragile (`isCoffreShare`, `isPublicGallery`) ; une
  régression y casserait soit l'auth (fuite d'accès), soit le partage public (redirection à tort).
- `nav-dock.spec.ts` — le nav-dock a peint invisible pendant tout le refactor pastel car il lui
  manquait `position: relative; z-index: 1` (peignait sous `Sky.svelte`, `position: fixed;
  z-index: 0`). Aucun log n'expliquait le symptôme.
- `pwa-version-check.spec.ts` — le cycle reload-au-changement-de-version doit se déclencher une
  fois, jamais boucler (garde-fou `sessionStorage.updatedTo`).
