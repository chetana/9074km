# ANTIGRAVITY — chet_lys (SvelteKit)

## Stack
- SvelteKit 5 + TypeScript.
- Cloud Run (europe-west1).

## Deploy
- **`gcloud run deploy lys --source . --env-vars-file envvars.yaml`**.
- Laisser Cloud Run builder côté serveur.
- Regénérer `envvars.yaml` via `node gen-envvars.cjs` si `.env` est modifié.

## Svelte 5 (CRITIQUE)
- **`$derived` + store legacy** : `$derived(auth.getFirstName())` est NON réactif.
- Utiliser `$derived($user?.name...)` (syntaxe auto-subscription).

## Audio / VAD
- Silero VAD v5 + ONNX Runtime.
- **`ort-wasm-simd-threaded.mjs`** requis dans `viteStaticCopy`.

## Auth Google
- FedCM activé : `use_fedcm_for_prompt: true`.
- Détection `isChet(name)` via NFD normalization.

## Fichiers GCS
- Convention `YYYY/MM/DD/filename`.
- Méta files (`note.txt`, `meta.json`, `reactions.json`) masqués.

## Commits
- **PAS de `Co-Authored-By`**.
- Svelte Check mandatory.
