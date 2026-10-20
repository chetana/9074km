import { rateLimitDecision } from './rate-limit'

const MINUTE = 60_000
const HOUR = 3_600_000
const DAY = 86_400_000

/** Plafond par utilisateur en fenêtre glissante, compteurs en mémoire (comme rlHits de hooks.server.ts). */
export function createUserLimiter(windowMs: number, max: number) {
  const hits = new Map<number, number[]>()
  return {
    /** true si l'action est autorisée (et comptée). */
    take(userId: number, now = Date.now()): boolean {
      const r = rateLimitDecision(hits.get(userId) ?? [], now, windowMs, max)
      hits.set(userId, r.hits)
      if (hits.size > 500) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k)
      return !r.limited
    },
    /** Rend le dernier crédit consommé (échec côté serveur : le quota ne doit pas être décompté). */
    refund(userId: number) { const h = hits.get(userId); if (h && h.length) h.pop() },
    reset() { hits.clear() },
  }
}

export const eventCreateLimiter = createUserLimiter(HOUR, 30)
export const exportLimiter = createUserLimiter(HOUR, 6)
const translateMinute = createUserLimiter(MINUTE, 20)
const translateDay = createUserLimiter(DAY, 200)

/** Une traduction de nom est-elle permise ? Ne consomme le quota du jour que si la minute passe. */
export function takeTranslation(userId: number, now = Date.now()): boolean {
  if (!translateMinute.take(userId, now)) return false
  return translateDay.take(userId, now)
}

export function resetEventLimitsForTests() {
  eventCreateLimiter.reset()
  exportLimiter.reset()
  translateMinute.reset()
  translateDay.reset()
}
