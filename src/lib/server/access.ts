export function parseAllowedEmails(raw: string | undefined | null): Set<string> {
	const out = new Set<string>()
	for (const part of (raw ?? '').split(/[\s,;]+/)) {
		const e = part.trim().toLowerCase()
		if (e && e.includes('@')) out.add(e)
	}
	return out
}

// Liste vide : refus en production (jamais d'accès ouvert par oubli), accepté seulement en dev.
export function isEmailAllowed(
	email: string | undefined | null,
	allowed: Set<string>,
	opts: { dev: boolean }
): boolean {
	if (!email) return false
	if (allowed.size === 0) return opts.dev === true
	return allowed.has(email.trim().toLowerCase())
}

export function isAccessExemptPath(pathname: string): boolean {
	return pathname.startsWith('/api/auth/') || pathname === '/api/version' || pathname.startsWith('/_app/')
}

// 403 et non 401 : api.ts relance la connexion sur 401, ce qui bouclerait pour un compte refusé.
export function forbiddenResponse(pathname: string): Response {
	if (pathname.startsWith('/api/')) {
		return new Response(JSON.stringify({ error: 'forbidden' }), {
			status: 403,
			headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
		})
	}
	const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Accès privé</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#fff7f2;color:#4a2a3a;font-family:system-ui,sans-serif;text-align:center;padding:24px}main{max-width:340px}h1{font-size:1.4rem;margin:0 0 8px}p{margin:0 0 20px;line-height:1.5}a{display:inline-block;padding:12px 20px;border-radius:999px;background:#c2185b;color:#fff;text-decoration:none}</style></head><body><main><h1>Accès privé</h1><p>Ce compte n'est pas autorisé à voir cette page.</p><a href="/api/auth/sign-out">Changer de compte</a></main></body></html>`
	return new Response(html, {
		status: 403,
		headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
	})
}
