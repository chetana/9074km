// Regroupement de messages consécutifs du même auteur — extrait pour l'implémentation Svelte du
// P7 du plan de modernisation (22/09/2026), d'après la maquette bubbles-states.html. Un groupe
// partage un seul avatar et un seul horodatage au lieu d'un par bulle.
export interface Groupable { author: string; ts: string }

const MAX_GAP_MS = 5 * 60_000

export function groupMessages<T extends Groupable>(msgs: T[]): T[][] {
	const groups: T[][] = []
	for (const msg of msgs) {
		const last = groups[groups.length - 1]
		const prev = last?.[last.length - 1]
		const sameAuthor = prev && prev.author === msg.author
		const withinGap = prev && Math.abs(new Date(msg.ts).getTime() - new Date(prev.ts).getTime()) <= MAX_GAP_MS
		if (sameAuthor && withinGap) {
			last.push(msg)
		} else {
			groups.push([msg])
		}
	}
	return groups
}
