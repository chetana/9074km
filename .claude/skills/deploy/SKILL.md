---
name: deploy
description: Commit, push and verify deployment on Vercel (auto-deploy on push)
allowed-tools: Bash, WebFetch, Read
---

# Deploy chet_lys

Deploy the SvelteKit app to Vercel. Push on `master` triggers auto-deploy — no manual deploy command needed.

## Steps

1. **Pre-flight checks**
   - Run `git status` to check for uncommitted changes
   - The pre-commit hook runs `svelte-check` automatically before each commit

2. **Commit & Push**
   - Stage relevant files (never stage `.env*` files)
   - Commit with a descriptive message (no Co-Authored-By)
   - Push to `origin master` → Vercel auto-deploys

3. **Post-deploy verification** (~30s after push)
   - Fetch `https://chetlys.vercel.app` and verify it loads
   - If errors, check Vercel dashboard or runtime logs

4. **Report** results to the user

## Important
- Always use nvm node: `export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"`
- Site URL: https://chetlys.vercel.app
- GitHub repo: chetana/9074km
- Branch: `master` (not main)
- **Auto-deploy** : git push suffit — pas besoin de `vercel deploy --prod`
