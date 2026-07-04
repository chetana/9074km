import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { APP_VERSION } from '$lib/version'

// Renvoie la version compilée dans la révision Cloud Run actuellement en ligne.
// Le client compare à SA version bundlée ; si différent → une version plus récente
// est livrée → rechargement forcé (voir +layout.svelte).
export const GET: RequestHandler = async () => {
	return json({ version: APP_VERSION }, {
		headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
	})
}
