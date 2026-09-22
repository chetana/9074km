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
