// Calcul PUR du carrousel « Album » : offset d (position de la carte − position du carrousel) → transformation 3D.
export const ALBUM = { near: 122, far: 36, tzNear: 70, tzFar: 90, ry: 44, boost: 0.1, farScale: 0.04, farFade: 0.28, nearFade: 0.12, maxD: 3.6 } as const;

export interface CardTransform {
	visible: boolean;
	tx: number;
	tz: number;
	rotY: number;
	scale: number;
	opacity: number;
	zIndex: number;
	brightness: number;
}

/** `reduced` (prefers-reduced-motion) : aucune inclinaison ni profondeur, simple translation + fondu. */
export function layoutAt(d: number, reduced = false): CardTransform {
	const a = Math.abs(d);
	const s = Math.sign(d);
	if (a > ALBUM.maxD) return { visible: false, tx: 0, tz: 0, rotY: 0, scale: 1, opacity: 0, zIndex: 0, brightness: 1 };
	const near = Math.min(a, 1);
	const far = Math.max(a - 1, 0);
	const opacity = Math.max(0, 1 - far * ALBUM.farFade - near * ALBUM.nearFade);
	const zIndex = 100 - Math.round(a * 10);
	if (reduced) {
		return { visible: true, tx: s * (near * 150 + far * 40), tz: 0, rotY: 0, scale: 1, opacity: Math.max(0, 1 - a * 0.35), zIndex, brightness: 1 };
	}
	return {
		visible: true,
		tx: s * (near * ALBUM.near + far * ALBUM.far) + 0,
		tz: -(near * ALBUM.tzNear + far * ALBUM.tzFar) + 0,
		rotY: -s * near * ALBUM.ry + 0,
		scale: 1 + (1 - near) * ALBUM.boost - far * ALBUM.farScale,
		opacity,
		zIndex,
		brightness: a < 0.5 ? 1 : 1 - Math.min(a, 2) * 0.08
	};
}

/** `spread` = facteur d'écartement (largeur de carte / largeur nominale) : décalages et profondeur le suivent. */
export function cssTransform(t: CardTransform, spread = 1): string {
	return `translate3d(${t.tx * spread}px,0,${t.tz * spread}px) rotateY(${t.rotY}deg) scale(${t.scale})`;
}

// Carte « Album » nominale : 208×310, agrandie de 10 % au centre ; marge pour le reflet et l'ombre.
export const CARD_W = 208;
export const CARD_H = 310;

export interface CardSize {
	w: number;
	h: number;
	/** hauteur de la légende (texte à taille fixe : jamais réduit avec la carte) */
	cap: number;
	/** 2e ligne de méta (nombre de médias, lieu) : masquée quand la carte est basse */
	meta2: boolean;
}

/** Taille de carte pour une scène de hauteur `stageH` : le texte garde sa taille, c'est la couverture qui rétrécit. */
export function cardSize(stageH: number): CardSize {
	const h = Math.min(CARD_H, Math.max(150, Math.floor((stageH - 4) / (1 + ALBUM.boost))));
	const w = Math.min(CARD_W, Math.max(170, Math.round(h * (CARD_W / CARD_H))));
	const cap = h >= 270 ? 146 : h >= 210 ? 124 : 104;
	return { w, h, cap, meta2: h >= 210 };
}

/** Hauteur de scène et mode serré pour `avail` px disponibles (scène + curseur). Hystérésis via `wasTight`. */
export function fitStage(avail: number, scrubH: number, wasTight: boolean): { stageH: number; tight: boolean } {
	const stageH = Math.min(440, Math.max(120, Math.floor(avail - scrubH - 4)));
	const tight = wasTight ? avail < TIGHT_BELOW + 110 : avail < TIGHT_BELOW;
	return { stageH, tight };
}
export const TIGHT_BELOW = 260;

export const clampPos = (p: number, len: number) => Math.min(Math.max(0, len - 1), Math.max(0, p));

/** Fin de glissement : carte la plus proche, prolongée par la vitesse (px/ms, signe de l'écran). */
export function snapTarget(pos: number, velocity: number, len: number): number {
	return clampPos(Math.round(pos - velocity * 2.2), len);
}

/** Indice de l'évènement dont la date de début est la plus proche de `date` (0 si liste vide ou date absente). */
export function nearestByDate(starts: string[], date: string | null): number {
	if (!date || starts.length === 0) return 0;
	const t = Date.parse(date);
	let best = 0;
	for (let i = 1; i < starts.length; i++) if (Math.abs(Date.parse(starts[i]) - t) < Math.abs(Date.parse(starts[best]) - t)) best = i;
	return best;
}

export interface Remembered {
	id: number;
	start: string;
}

/** Position au (re)montage ou après un filtre : même évènement s'il est là, sinon le plus proche en date de celui mémorisé. */
export function restoreIndex(list: { id: number; start: string }[], mem: Remembered | null): number {
	if (list.length === 0 || !mem) return 0;
	const i = list.findIndex((e) => e.id === mem.id);
	return i >= 0 ? i : nearestByDate(list.map((e) => e.start), mem.start);
}

export function parseRemembered(raw: string | null): Remembered | null {
	try {
		const o = raw ? JSON.parse(raw) : null;
		return o && Number.isInteger(o.id) && typeof o.start === 'string' && !Number.isNaN(Date.parse(o.start)) ? { id: o.id, start: o.start } : null;
	} catch {
		return null;
	}
}
