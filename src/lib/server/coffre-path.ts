// Validation pure du format de path coffre — le bucket S3 est PARTAGÉ entre plusieurs features
// (coffre: YYYY/MM/DD/fichier, chat: chat/YYYY/MM/DD.json, apprendre: apprendre/lessons/*,
// translation-issues: translation-issues/*). Sans cette validation, delete/sign-download/og-image
// acceptaient n'importe quel path — un utilisateur connecté (ou, pour og-image, N'IMPORTE QUI vu
// que cette route est publique sans auth) pouvait lire ou supprimer une clé S3 d'une autre feature
// (ex. chat/2026/09/22.json). Trouvé lors de l'audit de fiabilité du 22/09/2026.
const COFFRE_PATH = /^\d{4}\/\d{2}\/\d{2}\/[^/]+$/

export function isValidCoffrePath(path: string): boolean {
	return COFFRE_PATH.test(path)
}

// Préfixes de navigation légitimes dans le coffre : racine (années), YYYY/ (mois), YYYY/MM/
// (jours), YYYY/MM/DD/ (fichiers d'un jour). Utilisé par list/+server.ts et cover/+server.ts —
// avant cette validation, /api/coffre/list acceptait n'importe quel préfixe (ex. "chat/" ou
// "apprendre/lessons/"), permettant à un utilisateur connecté d'énumérer les clés S3 d'une autre
// feature du bucket partagé. Trouvé en même temps que l'ajout de cover/+server.ts (23/09/2026).
const COFFRE_PREFIX = /^$|^\d{4}\/$|^\d{4}\/\d{2}\/$|^\d{4}\/\d{2}\/\d{2}\/$/

export function isValidCoffrePrefix(prefix: string): boolean {
	return COFFRE_PREFIX.test(prefix)
}

// Une "couverture" n'a de sens que pour une année ou un mois (pas un jour seul, pas la racine).
const COVER_PREFIX = /^\d{4}\/$|^\d{4}\/\d{2}\/$/

export function isValidCoverPrefix(prefix: string): boolean {
	return COVER_PREFIX.test(prefix)
}

// Fichiers méta stockés à côté des photos/vidéos dans chaque dossier jour — jamais une couverture.
export const COFFRE_META_FILES = ['note.txt', 'meta.json', 'reactions.json']

export function isMediaFile(key: string): boolean {
	const filename = key.split('/').pop() ?? ''
	return filename !== '' && !COFFRE_META_FILES.includes(filename)
}

// Pour une VIGNETTE (cover année/mois, thumbnail jour) : og-image (sharp) sait redimensionner une
// image, pas une vidéo — un fichier vidéo choisi comme couverture ferait planter le rendu.
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|heic)$/i
export function isImageFile(key: string): boolean {
	return IMAGE_EXT.test(key)
}
