import { geminiTranslateAll } from './vertex'
import { buildEventNameUser } from './khmer-guards'
import { containsKhmer } from './events-validate'
import { applyTranslations } from './events-store'
import { takeTranslation } from './events-limits'
import type { NameLang } from './events-validate'

const clamp = (s: string | undefined, fallback: string) => {
  const t = (s ?? '').normalize('NFC').replace(/\s+/g, ' ').trim()
  return t ? Array.from(t).slice(0, 80).join('') : fallback
}

/** Traduit le nom en arrière-plan : jamais bloquant, erreurs journalisées. Appelée APRÈS l'écriture. */
export function scheduleNameTranslation(userId: number, eventId: number, srcLang: NameLang, srcText: string): boolean {
  if (!takeTranslation(userId)) return false // plafond atteint : le nom source reste dans les 3 langues, names_pending=true
  void (async () => {
    try {
      const t = await geminiTranslateAll(srcText, undefined, undefined, buildEventNameUser)
      const out = { fr: clamp(t.fr, srcText), en: clamp(t.en, srcText), kh: clamp(t.kh, srcText) }
      out[srcLang] = srcText
      // Un « khmer » sans caractère khmer = repli de dernier recours du moteur : on laisse en attente.
      if (srcLang !== 'kh' && !containsKhmer(out.kh)) {
        console.warn(`[events] traduction khmère inexploitable pour l'évènement ${eventId}, names_pending conservé`)
        return
      }
      await applyTranslations(eventId, srcLang, srcText, out)
    } catch (e) {
      console.error(`[events] traduction du nom échouée (évènement ${eventId}):`, (e as Error)?.message)
    }
  })()
  return true
}
