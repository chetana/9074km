import { describe, it, expect } from 'vitest'
import { T } from './events-i18n'

describe('libellés khmers', () => {
	const entries = Object.entries(T)
	it('chaque libellé a un français et un khmer non vides', () => {
		for (const [k, v] of entries) { expect(v.fr, k).not.toBe(''); expect(v.kh, k).not.toBe('') }
	})
	it('khmer pur : aucun caractère latin/thaï/autre (ponctuation et « » … autorisées)', () => {
		for (const [k, v] of entries) expect(v.kh, k).toMatch(/^[ក-៿​\s«»…:·()]+$/)
	})
	it('orthographe du projet : ឲ្យ (pas ឱ្យ), ម្តង (pas មួយដង)', () => {
		for (const [k, v] of entries) { expect(v.kh, k).not.toContain('ឱ្យ'); expect(v.kh, k).not.toContain('មួយដង') }
	})
})
