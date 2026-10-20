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

/** `k` = échelle de la carte (taille calculée depuis la hauteur disponible) : décalages et profondeur suivent. */
export function cssTransform(t: CardTransform, k = 1): string {
	return `translate3d(${t.tx * k}px,0,${t.tz * k}px) rotateY(${t.rotY}deg) scale(${t.scale * k})`;
}

// Carte « Album » : 310 px de haut, agrandie de 10 % au centre ; marge pour le reflet et l'ombre.
export const CARD_H = 310;
export const CARD_FULL_H = Math.ceil(CARD_H * (1 + ALBUM.boost)) + 4;

/** Échelle de la carte pour une scène de hauteur `stageH` (ratio conservé, jamais agrandie, plancher 0,4). */
export function cardScale(stageH: number): number {
	return Math.min(1, Math.max(0.4, stageH / CARD_FULL_H));
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
