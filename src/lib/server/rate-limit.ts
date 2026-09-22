// Décision pure de rate-limit par fenêtre glissante — extraite de hooks.server.ts le 22/09/2026
// pour être testable sans dépendre du cycle de vie SvelteKit (Handle, Map en mémoire de module).
// L'état (Map<ip, number[]>) reste dans hooks.server.ts ; cette fonction ne fait que la décision
// et le calcul de la fenêtre glissante à partir de l'état qu'on lui donne.
export function rateLimitDecision(
	hits: number[], now: number, windowMs: number, max: number
): { limited: boolean; hits: number[] } {
	const recent = hits.filter((t) => now - t < windowMs)
	if (recent.length >= max) return { limited: true, hits: recent }
	recent.push(now)
	return { limited: false, hits: recent }
}
