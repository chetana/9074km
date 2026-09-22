import { describe, it, expect } from 'vitest'
import { isValidCoffrePath, isValidCoffrePrefix, isValidCoverPrefix, isMediaFile } from './coffre-path'

describe('isValidCoffrePath', () => {
	it('accepte un path coffre bien formé', () => {
		expect(isValidCoffrePath('2026/09/22/photo.jpg')).toBe(true)
	})

	it('rejette un path vers une autre feature du bucket (chat, apprendre, translation-issues)', () => {
		expect(isValidCoffrePath('chat/2026/09/22.json')).toBe(false)
		expect(isValidCoffrePath('apprendre/lessons/unit1-fr.json')).toBe(false)
		expect(isValidCoffrePath('translation-issues/2026/09/22/abc.json')).toBe(false)
	})

	it('rejette un traversal de répertoire', () => {
		expect(isValidCoffrePath('2026/09/../../../etc/passwd')).toBe(false)
		expect(isValidCoffrePath('../2026/09/22/photo.jpg')).toBe(false)
	})

	it('rejette une année/mois/jour mal formés', () => {
		expect(isValidCoffrePath('26/9/22/photo.jpg')).toBe(false)
		expect(isValidCoffrePath('2026/09/22/')).toBe(false)
		expect(isValidCoffrePath('2026/09/photo.jpg')).toBe(false)
	})

	it('rejette un sous-dossier supplémentaire dans le nom de fichier', () => {
		expect(isValidCoffrePath('2026/09/22/sub/photo.jpg')).toBe(false)
	})

	it('rejette une chaîne vide', () => {
		expect(isValidCoffrePath('')).toBe(false)
	})
})

describe('isValidCoffrePrefix', () => {
	it('accepte les 4 profondeurs de navigation légitimes', () => {
		expect(isValidCoffrePrefix('')).toBe(true)
		expect(isValidCoffrePrefix('2026/')).toBe(true)
		expect(isValidCoffrePrefix('2026/09/')).toBe(true)
		expect(isValidCoffrePrefix('2026/09/22/')).toBe(true)
	})

	it('rejette un préfixe vers une autre feature du bucket', () => {
		expect(isValidCoffrePrefix('chat/')).toBe(false)
		expect(isValidCoffrePrefix('apprendre/lessons/')).toBe(false)
	})

	it('rejette un préfixe sans slash final ou mal formé', () => {
		expect(isValidCoffrePrefix('2026')).toBe(false)
		expect(isValidCoffrePrefix('2026/09/22/photo.jpg')).toBe(false)
		expect(isValidCoffrePrefix('26/')).toBe(false)
	})
})

describe('isValidCoverPrefix', () => {
	it('accepte année et mois, jamais la racine ni un jour', () => {
		expect(isValidCoverPrefix('2026/')).toBe(true)
		expect(isValidCoverPrefix('2026/09/')).toBe(true)
		expect(isValidCoverPrefix('')).toBe(false)
		expect(isValidCoverPrefix('2026/09/22/')).toBe(false)
	})
})

describe('isMediaFile', () => {
	it('accepte une photo/vidéo', () => {
		expect(isMediaFile('2026/09/22/photo.jpg')).toBe(true)
		expect(isMediaFile('2026/09/22/video.mp4')).toBe(true)
	})

	it('rejette les fichiers méta', () => {
		expect(isMediaFile('2026/09/22/note.txt')).toBe(false)
		expect(isMediaFile('2026/09/22/meta.json')).toBe(false)
		expect(isMediaFile('2026/09/22/reactions.json')).toBe(false)
	})

	it('rejette une clé qui se termine par un slash (dossier)', () => {
		expect(isMediaFile('2026/09/22/')).toBe(false)
	})
})
