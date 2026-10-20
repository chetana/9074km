import type { ExifData } from './exif';
import { U } from './upload-i18n';

export type ExifMap = Map<File, ExifData | null>;

const isImage = (f: File) => f.type.startsWith('image/');

export interface ExifLoad {
	/** Fichier → EXIF lu (null = lu, pas d'EXIF). Les fichiers dont la lecture a échoué n'y figurent PAS. */
	map: ExifMap;
	/** Photos dont la lecture a échoué (même après une nouvelle tentative) : jamais confondues avec « sans EXIF ». */
	failed: File[];
}

export interface LoadExifOptions {
	concurrency?: number;
	onProgress?: (done: number, total: number) => void;
	/** Lecteur strict (lève si illisible) ; injecté dans les tests. */
	read?: (f: File) => Promise<ExifData | null>;
}

/**
 * Lit l'EXIF des photos AVANT toute compression (import dynamique : le parseur n'alourdit pas le bundle initial).
 * Concurrence bornée (4), try/catch PAR fichier avec une nouvelle tentative : un échec ne perd jamais les autres.
 */
export async function loadExif(files: File[], opts: LoadExifOptions = {}): Promise<ExifLoad> {
	const map: ExifMap = new Map();
	const failed: File[] = [];
	const images = files.filter(isImage);
	if (images.length === 0) return { map, failed };
	let read = opts.read;
	if (!read) {
		try {
			read = (await import('./exif')).readExifStrict;
		} catch {
			return { map, failed: [...images] }; // parseur indisponible : signalé, pas silencieux
		}
	}
	const limit = Math.max(1, opts.concurrency ?? 4);
	let next = 0;
	let done = 0;
	const worker = async () => {
		while (next < images.length) {
			const f = images[next++];
			let ok = false;
			for (let attempt = 0; attempt < 2 && !ok; attempt++) {
				try {
					map.set(f, await read!(f));
					ok = true;
				} catch {
					// nouvelle tentative, puis échec signalé
				}
			}
			if (!ok) failed.push(f);
			opts.onProgress?.(++done, images.length);
		}
	};
	await Promise.all(Array.from({ length: Math.min(limit, images.length) }, worker));
	return { map, failed };
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
	/** Photos sans date de prise de vue alors que d'autres en ont une (ou aucune n'en a dans un lot) : date choisie. */
	noDate: number;
	/** Photos dont l'EXIF n'a pas pu être lu : proposées en « Réessayer la lecture », jamais envoyées en silence. */
	failed: File[];
	/** Aucune photo du lot n'a d'EXIF lisible (lot de plusieurs images). */
	noneReadable: boolean;
}

/** Compare les dates de prise de vue (heure murale locale, jamais convertie) à la date choisie. */
export function planUploadDates(files: File[], exif: ExifMap, chosen: string, failed: File[] = []): UploadPlan {
	const keep: DateGroup[] = [{ date: chosen, files, fromExif: false }];
	const days = new Map<string, File[]>();
	const failedSet = new Set(failed);
	let differs = false;
	let withDate = 0;
	let noDate = 0;
	let images = 0;
	for (const f of files) {
		const takenAt = exif.get(f)?.takenAt;
		if (isImage(f)) {
			images++;
			if (takenAt) withDate++;
			else if (!failedSet.has(f)) noDate++;
		}
		const day = takenAt?.slice(0, 10) ?? chosen;
		if (day !== chosen) differs = true;
		days.set(day, [...(days.get(day) ?? []), f]);
	}
	const noneReadable = images >= 2 && withDate === 0;
	const mixed = withDate > 0 && noDate > 0;
	const needsConfirm = differs || failed.length > 0 || mixed || noneReadable;
	if (!needsConfirm) return { needsConfirm: false, byTaken: keep, keep, noDate: 0, failed: [], noneReadable: false };
	const byTaken = [...days]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([date, fs]) => ({ date, files: fs, fromExif: date !== chosen || fs.some((f) => !!exif.get(f)?.takenAt) }));
	return { needsConfirm: true, byTaken, keep, noDate, failed, noneReadable };
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

export interface UploadedItem {
	path: string;
	size: number;
	exif: ExifData | null;
}

const RECORD_CHUNK = 500;

/**
 * Enregistre les photos réellement envoyées + EXIF. Best-effort (n'échoue jamais côté appelant) mais jamais muet :
 * statut vérifié, une nouvelle tentative, échec journalisé en console. Découpe par lots de 500.
 */
export async function recordUploads(items: UploadedItem[], doFetch: typeof fetch = (...a) => fetch(...a)): Promise<void> {
	if (items.length === 0) return;
	for (let i = 0; i < items.length; i += RECORD_CHUNK) {
		const slice = items.slice(i, i + RECORD_CHUNK).map(({ path, size, exif }) => ({
			path,
			size,
			...(exif?.takenAt ? { takenAt: exif.takenAt, ...(exif.offset ? { takenOffset: exif.offset } : {}) } : {}),
			...(exif?.lat != null && exif?.lng != null ? { lat: round6(exif.lat), lng: round6(exif.lng) } : {}),
			...(exif?.make ? { make: exif.make } : {}),
			...(exif?.model ? { model: exif.model } : {})
		}));
		const body = JSON.stringify({ items: slice });
		let ok = false;
		for (let attempt = 0; attempt < 2 && !ok; attempt++) {
			try {
				const res = await doFetch('/api/coffre/media', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body });
				ok = res.ok;
				if (!ok) console.warn(`[recordUploads] lot ${i / RECORD_CHUNK + 1} refusé (HTTP ${res.status}), tentative ${attempt + 1}/2`);
			} catch (e) {
				console.warn(`[recordUploads] lot ${i / RECORD_CHUNK + 1} injoignable, tentative ${attempt + 1}/2`, e);
			}
		}
		if (!ok) console.error(`[recordUploads] lot ${i / RECORD_CHUNK + 1} NON enregistré (${slice.length} photos) : l'index se rattrapera`);
	}
}

/** « 2 photos · 1 vidéo » (fr) et équivalent khmer : photos et vidéos comptées séparément. */
export function countsLabel(files: File[]): { fr: string; kh: string } {
	const videos = files.filter((f) => f.type.startsWith('video/')).length;
	const photos = files.length - videos;
	const fr: string[] = [];
	const kh: string[] = [];
	if (photos) { fr.push(`${photos} ${photos > 1 ? 'photos' : 'photo'}`); kh.push(`${photos} ${U.photos.kh}`); }
	if (videos) { fr.push(`${videos} ${videos > 1 ? 'vidéos' : 'vidéo'}`); kh.push(`${videos} ${U.videos.kh}`); }
	return { fr: fr.join(' · '), kh: kh.join(' · ') };
}
