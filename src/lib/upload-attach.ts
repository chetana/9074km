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

export interface SkippedPhoto {
	eventId: number; // évènement visé par l'envoi
	path: string;
	otherEventId: number; // évènement où la photo est DÉJÀ rangée
}

/**
 * Rattache après un envoi : SEULEMENT les chemins réellement envoyés (jamais de lien fantôme), un lot par
 * évènement. Un échec est remonté (jamais avalé) pour que l'appelant propose « Réessayer ».
 */
export async function attachUploaded(
	jobs: AttachJob[],
	add: (eventId: number, paths: string[]) => Promise<void | { skipped?: { path: string; eventId: number }[] }>
): Promise<{ failed: AttachJob[]; skipped: SkippedPhoto[] }> {
	const failed: AttachJob[] = [];
	const skipped: SkippedPhoto[] = [];
	for (const j of jobs) {
		if (j.paths.length === 0) continue;
		try {
			const r = await add(j.eventId, j.paths);
			for (const s of (r && r.skipped) || []) skipped.push({ eventId: j.eventId, path: s.path, otherEventId: s.eventId });
		} catch {
			failed.push(j);
		}
	}
	return { failed, skipped };
}

/** Message « déjà dans un autre évènement » : nomme l'évènement s'il est unique et connu. */
export function skippedMessage(
	n: number,
	otherName: string | null,
	T: { skipOther: { fr: string; kh: string }; skipNamed: { fr: string; kh: string } }
): { fr: string; kh: string } {
	const plural = (s: string) => s.replace('photo(s)', n > 1 ? 'photos' : 'photo').replace('non déplacée(s)', n > 1 ? 'non déplacées' : 'non déplacée').replace('{n}', String(n));
	const t = otherName ? T.skipNamed : T.skipOther;
	const fill = (s: string) => s.replace('{n}', String(n)).replace('{x}', otherName ?? '');
	return { fr: fill(plural(t.fr)), kh: fill(t.kh) };
}
