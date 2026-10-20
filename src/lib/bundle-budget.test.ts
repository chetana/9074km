import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { verdict, measureCoffreBundle, TOLERANCE } from '../../scripts/bundle-budget.mjs'

const ROOT = join(__dirname, '../..')
const baseline = JSON.parse(readFileSync(join(ROOT, 'scripts/bundle-budget.json'), 'utf8')).gzip as number
const built = existsSync(join(ROOT, '.svelte-kit/generated/client-optimized/app.js'))

describe('budget du bundle initial du coffre', () => {
	it('tolère exactement +15 % et échoue au-delà', () => {
		expect(TOLERANCE).toBe(0.15)
		expect(verdict(1150, 1000).ok).toBe(true)
		expect(verdict(1151, 1000).ok).toBe(false)
		expect(verdict(500, 1000).ok).toBe(true)
	})

	// Nécessite `npm run build` ; sinon ignoré (le script npm run check:bundle échoue seul sans build).
	it.skipIf(!built)('le bundle réel du build courant reste sous la limite', () => {
		const m = measureCoffreBundle()
		const v = verdict(m.gzip ?? m, baseline)
		expect(v.ok, `bundle ${m.gzip ?? m} octets gzip, limite ${Math.round(baseline * 1.15)}`).toBe(true)
	})
})
