import type { ExifData } from './exif';

export type ExifMap = Map<File, ExifData | null>;

const isImage = (f: File) => f.type.startsWith('image/');

/** Lit l'EXIF des photos AVANT toute compression (import dynamique : le parseur n'alourdit pas le bundle initial). */
export async function loadExif(files: File[]): Promise<ExifMap> {
	const map: ExifMap = new Map();
	const images = files.filter(isImage);
	if (images.length === 0) return map;
	try {
		const { readExif } = await import('./exif');
		await Promise.all(images.map(async (f) => map.set(f, await readExif(f))));
	} catch {
		// parseur indisponible : l'envoi continue sans EXIF
	}
	return map;
}

export interface DateGroup {
	date: string; // AAAA-MM-JJ
	files: File[];
	fromExif: boolean;
}

export interface UploadPlan {
	needsConfirm: boolean;
	/** Rangement par date de prise de vue (photos sans date EXIF et vidéos : date choisie). */
	byTaken: DateGroup[];
	/** Rangement actuel : tout à la date choisie. */
	keep: DateGroup[];
}

/** Compare les dates de prise de vue (heure murale locale, jamais convertie) à la date choisie. */
export function planUploadDates(files: File[], exif: ExifMap, chosen: string): UploadPlan {
	const keep: DateGroup[] = [{ date: chosen, files, fromExif: false }];
	const days = new Map<string, File[]>();
	let differs = false;
	for (const f of files) {
		const day = exif.get(f)?.takenAt?.slice(0, 10) ?? chosen;
		if (day !== chosen) differs = true;
		days.set(day, [...(days.get(day) ?? []), f]);
	}
	if (!differs) return { needsConfirm: false, byTaken: keep, keep };
	const byTaken = [...days]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([date, fs]) => ({ date, files: fs, fromExif: date !== chosen || fs.some((f) => !!exif.get(f)?.takenAt) }));
	return { needsConfirm: true, byTaken, keep };
}

export interface UploadedItem {
	path: string;
	size: number;
	exif: ExifData | null;
}

/** Enregistre les photos réellement envoyées + EXIF. Best-effort : n'échoue jamais, n'attend rien d'autre. */
export async function recordUploads(items: UploadedItem[]): Promise<void> {
	if (items.length === 0) return;
	try {
		for (let i = 0; i < items.length; i += 500) {
			const slice = items.slice(i, i + 500).map(({ path, size, exif }) => ({
				path,
				size,
				...(exif?.takenAt ? { takenAt: exif.takenAt, ...(exif.offset ? { takenOffset: exif.offset } : {}) } : {}),
				...(exif?.lat != null && exif?.lng != null ? { lat: exif.lat, lng: exif.lng } : {}),
				...(exif?.make ? { make: exif.make } : {}),
				...(exif?.model ? { model: exif.model } : {})
			}));
			await fetch('/api/coffre/media', {
				method: 'POST',
				credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ items: slice })
			});
		}
	} catch {
		// l'upload est déjà réussi : l'index EXIF se rattrapera
	}
}
