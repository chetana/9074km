import type { EventDTO } from './events-types';

/** Évènement pré-sélectionné pour une date : le premier couvrant avec « ajouter ici » activé (le serveur trie auto_attach d'abord). */
export function preselectEvent(covering: EventDTO[]): number | null {
	return covering.find((e) => e.autoAttach)?.id ?? null;
}

export interface AttachGroup {
	date: string;
	eventId: number | null;
}

/**
 * Évènement de chaque lot de dates : la date choisie dans le sheet garde le choix EXPLICITE de
 * l'utilisateur (y compris « Aucun »), toute autre date prend l'évènement qui la couvre (ou aucun).
 */
export function resolveGroupEvents(
	dates: string[],
	chosenDate: string,
	chosenEventId: number | null,
	coveringByDate: Map<string, EventDTO[]>
): AttachGroup[] {
	return dates.map((date) => ({
		date,
		eventId: date === chosenDate ? chosenEventId : preselectEvent(coveringByDate.get(date) ?? [])
	}));
}

export interface AttachJob {
	eventId: number;
	paths: string[];
}

/**
 * Rattache après un envoi : SEULEMENT les chemins réellement envoyés (jamais de lien fantôme), un lot par
 * évènement. Un échec est remonté (jamais avalé) pour que l'appelant propose « Réessayer ».
 */
export async function attachUploaded(
	jobs: AttachJob[],
	add: (eventId: number, paths: string[]) => Promise<void>
): Promise<AttachJob[]> {
	const failed: AttachJob[] = [];
	for (const j of jobs) {
		if (j.paths.length === 0) continue;
		try {
			await add(j.eventId, j.paths);
		} catch {
			failed.push(j);
		}
	}
	return failed;
}
