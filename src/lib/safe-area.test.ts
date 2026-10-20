import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Écrans fixes/plein écran : ils doivent réserver les zones sûres de l'iPhone (Dynamic Island, barre d'accueil).
const ROOT = join(__dirname, '../..')
const CASES: Array<[string, 'top' | 'bottom']> = [
	['src/lib/BottomSheet.svelte', 'bottom'],
	['src/lib/Toasts.svelte', 'bottom'],
	['src/routes/+layout.svelte', 'bottom'],
	['src/routes/coffre/+page.svelte', 'top'],
	['src/routes/coffre/components/SortMode.svelte', 'top'],
	['src/routes/coffre/components/SortMode.svelte', 'bottom'],
	['src/routes/coffre/components/FileViewer.svelte', 'top'],
	['src/routes/coffre/components/FileViewer.svelte', 'bottom'],
	['src/routes/coffre/components/FabUpload.svelte', 'bottom']
]

describe('zones sûres iPhone', () => {
	for (const [file, side] of CASES) {
		it(`${file} réserve safe-area-inset-${side}`, () => {
			expect(readFileSync(join(ROOT, file), 'utf8')).toContain(`env(safe-area-inset-${side}`)
		})
	}
})
