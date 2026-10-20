import { describe, it, expect } from 'vitest'
import { parseAllowedEmails, isEmailAllowed, isAccessExemptPath, forbiddenResponse } from './access'

describe('parseAllowedEmails', () => {
	it('sépare par virgule, point-virgule, espaces et retours, en minuscules', () => {
		const s = parseAllowedEmails('Chetana.Yin@gmail.com, vornsoklyly28@gmail.com;\n  x@y.fr ')
		expect([...s].sort()).toEqual(['chetana.yin@gmail.com', 'vornsoklyly28@gmail.com', 'x@y.fr'])
	})
	it('ignore les valeurs vides ou sans @', () => {
		expect(parseAllowedEmails('').size).toBe(0)
		expect(parseAllowedEmails(undefined).size).toBe(0)
		expect(parseAllowedEmails(' , ;; pirate ').size).toBe(0)
	})
})

describe('isEmailAllowed', () => {
	const list = parseAllowedEmails('chetana.yin@gmail.com,vornsoklyly28@gmail.com')
	it('accepte exactement les adresses de la liste, sans tenir compte de la casse', () => {
		expect(isEmailAllowed('chetana.yin@gmail.com', list, { dev: false })).toBe(true)
		expect(isEmailAllowed('VornsokLyly28@Gmail.com', list, { dev: false })).toBe(true)
	})
	it('refuse toute autre adresse, y compris les variantes Gmail (points, +tag)', () => {
		expect(isEmailAllowed('yincgame@gmail.com', list, { dev: false })).toBe(false)
		expect(isEmailAllowed('chetanayin@gmail.com', list, { dev: false })).toBe(false)
		expect(isEmailAllowed('chetana.yin+x@gmail.com', list, { dev: false })).toBe(false)
		expect(isEmailAllowed('chetana.yin@gmail.com.evil.io', list, { dev: false })).toBe(false)
	})
	it('refuse un e-mail absent ou vide', () => {
		expect(isEmailAllowed(undefined, list, { dev: true })).toBe(false)
		expect(isEmailAllowed('', list, { dev: true })).toBe(false)
	})
	it('liste vide : refus en production (échec fermé), accepté seulement en dev', () => {
		expect(isEmailAllowed('chetana.yin@gmail.com', new Set(), { dev: false })).toBe(false)
		expect(isEmailAllowed('chetana.yin@gmail.com', new Set(), { dev: true })).toBe(true)
	})
	it('une liste non vide s\'applique aussi en dev', () => {
		expect(isEmailAllowed('yincgame@gmail.com', list, { dev: true })).toBe(false)
	})
})

describe('chemins exemptés et réponse 403', () => {
	it('seuls auth, version et assets restent joignables', () => {
		expect(isAccessExemptPath('/api/auth/sign-out')).toBe(true)
		expect(isAccessExemptPath('/api/version')).toBe(true)
		expect(isAccessExemptPath('/_app/immutable/x.js')).toBe(true)
		expect(isAccessExemptPath('/api/coffre/list')).toBe(false)
		expect(isAccessExemptPath('/coffre')).toBe(false)
		expect(isAccessExemptPath('/api/authx')).toBe(false)
	})
	it('403 JSON pour /api et page HTML sinon, jamais 401 (api.ts relancerait la connexion en boucle)', async () => {
		const a = forbiddenResponse('/api/coffre/events')
		expect(a.status).toBe(403)
		expect(await a.json()).toEqual({ error: 'forbidden' })
		const p = forbiddenResponse('/coffre')
		expect(p.status).toBe(403)
		expect(p.headers.get('Content-Type')).toContain('text/html')
		expect(await p.text()).toContain('/api/auth/sign-out')
	})
})
