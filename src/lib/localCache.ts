/**
 * Cache localStorage pour utilisation fluide / quasi-offline.
 * Chaque type de donnée a son propre préfixe dans localStorage.
 *
 * Stratégie : afficher le cache immédiatement, rafraîchir en arrière-plan,
 * puis mettre à jour le cache avec les données fraîches.
 *
 * Intégrité : un numéro de version est stocké. Si la version change (deploy)
 * ou si les données sont corrompues, tout le cache est purgé automatiquement.
 */

const PREFIX = 'lys_cache_';
const VERSION_KEY = `${PREFIX}version`;
const CACHE_VERSION = 2; // ← incrémenter à chaque changement de schéma
const USER_KEY = `${PREFIX}user_v1`;
const MESSAGES_PREFIX = `${PREFIX}msg_`;
const COFFRE_LIST_PREFIX = `${PREFIX}clist_`;
const COFFRE_NOTE_PREFIX = `${PREFIX}cnote_`;
const COFFRE_META_PREFIX = `${PREFIX}cmeta_`;
const COFFRE_REACT_PREFIX = `${PREFIX}creact_`;
const LESSONS_KEY = `${PREFIX}lessons_v1`;
const XP_KEY = `${PREFIX}xp_v1`;

function safe() { return typeof localStorage !== 'undefined'; }

// ── Intégrité & auto-purge ───────────────────────────────────────────────

function purgeAll(): void {
  if (!safe()) return;
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(PREFIX)) toRemove.push(k);
  }
  toRemove.forEach(k => localStorage.removeItem(k));
  // Aussi nettoyer l'ancien audio cache et le sessionStorage token
  // pour garantir un état propre
  localStorage.removeItem('lys_audio_cache_v1');
}

/** Vérifie l'intégrité du cache au démarrage. Purge si version incorrecte ou données corrompues. */
export function checkCacheIntegrity(): void {
  if (!safe()) return;
  try {
    // 1. Vérifier la version
    const raw = localStorage.getItem(VERSION_KEY);
    const storedVersion = raw ? Number(raw) : 0;
    if (storedVersion !== CACHE_VERSION) {
      console.warn(`[cache] Version mismatch (${storedVersion} → ${CACHE_VERSION}), purging cache`);
      purgeAll();
      localStorage.setItem(VERSION_KEY, String(CACHE_VERSION));
      return;
    }

    // 2. Valider les entrées critiques (user, messages, lists)
    const userRaw = localStorage.getItem(USER_KEY);
    if (userRaw) {
      const user = JSON.parse(userRaw);
      if (!user || typeof user.name !== 'string' || typeof user.email !== 'string') {
        throw new Error('Invalid cached user');
      }
    }

    // 3. Vérifier que les clés lys_cache_* sont toutes du JSON valide
    let corruptCount = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(PREFIX) || k === VERSION_KEY) continue;
      try {
        const v = localStorage.getItem(k);
        if (v) JSON.parse(v);
      } catch {
        corruptCount++;
        localStorage.removeItem(k);
      }
    }
    if (corruptCount > 0) {
      console.warn(`[cache] Removed ${corruptCount} corrupt entries`);
    }
  } catch {
    // Toute erreur inattendue → purge complète
    console.warn('[cache] Integrity check failed, purging all cache');
    purgeAll();
    localStorage.setItem(VERSION_KEY, String(CACHE_VERSION));
  }
}

function get<T>(key: string): T | null {
  if (!safe()) return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function set(key: string, data: unknown): void {
  if (!safe()) return;
  try { localStorage.setItem(key, JSON.stringify(data)); } catch { /* quota */ }
}

function del(key: string): void {
  if (!safe()) return;
  localStorage.removeItem(key);
}

// ── User ──────────────────────────────────────────────────────────────────

export interface CachedUser {
  name: string;
  email: string;
  picture: string;
  /** Timestamp of last successful login — pour info */
  cachedAt: number;
}

export function getCachedUser(): CachedUser | null {
  return get<CachedUser>(USER_KEY);
}

export function setCachedUser(user: { name: string; email: string; picture: string }): void {
  set(USER_KEY, { ...user, cachedAt: Date.now() });
}

export function clearCachedUser(): void {
  del(USER_KEY);
}

// ── Chat messages ─────────────────────────────────────────────────────────

function msgKey(y: string, m: string, d: string): string {
  return `${MESSAGES_PREFIX}${y}_${m}_${d}`;
}

export function getCachedMessages(y: string, m: string, d: string): unknown[] | null {
  return get<unknown[]>(msgKey(y, m, d));
}

export function setCachedMessages(y: string, m: string, d: string, msgs: unknown[]): void {
  set(msgKey(y, m, d), msgs);
}

// ── Coffre list ───────────────────────────────────────────────────────────

function clistKey(prefix: string): string {
  return `${COFFRE_LIST_PREFIX}${prefix}`;
}

export function getCachedList(prefix: string): unknown | null {
  return get(clistKey(prefix));
}

export function setCachedList(prefix: string, data: unknown): void {
  set(clistKey(prefix), data);
}

export function invalidateCachedList(prefix: string): void {
  if (!safe()) return;
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(COFFRE_LIST_PREFIX)) {
      const cached = k.slice(COFFRE_LIST_PREFIX.length);
      if (cached.startsWith(prefix) || prefix.startsWith(cached)) {
        keys.push(k);
      }
    }
  }
  keys.forEach(k => localStorage.removeItem(k));
}

// ── Coffre note / meta / reactions ────────────────────────────────────────

function dayKey(base: string, y: string, m: string, d: string): string {
  return `${base}${y}_${m}_${d}`;
}

export function getCachedNote(y: string, m: string, d: string): string | null {
  return get<string>(dayKey(COFFRE_NOTE_PREFIX, y, m, d));
}
export function setCachedNote(y: string, m: string, d: string, text: string): void {
  set(dayKey(COFFRE_NOTE_PREFIX, y, m, d), text);
}

export function getCachedMeta(y: string, m: string, d: string): Record<string, string> | null {
  return get<Record<string, string>>(dayKey(COFFRE_META_PREFIX, y, m, d));
}
export function setCachedMeta(y: string, m: string, d: string, meta: Record<string, string>): void {
  set(dayKey(COFFRE_META_PREFIX, y, m, d), meta);
}

export function getCachedReactions(y: string, m: string, d: string): Record<string, string[]> | null {
  return get<Record<string, string[]>>(dayKey(COFFRE_REACT_PREFIX, y, m, d));
}
export function setCachedReactions(y: string, m: string, d: string, reactions: Record<string, string[]>): void {
  set(dayKey(COFFRE_REACT_PREFIX, y, m, d), reactions);
}

// ── Lessons & XP ──────────────────────────────────────────────────────────

export function getCachedLessons(): unknown[] | null {
  return get<unknown[]>(LESSONS_KEY);
}
export function setCachedLessons(lessons: unknown[]): void {
  set(LESSONS_KEY, lessons);
}

export function getCachedXp(): number | null {
  return get<number>(XP_KEY);
}
export function setCachedXp(xp: number): void {
  set(XP_KEY, xp);
}

// ── Cleanup ───────────────────────────────────────────────────────────────

/** Supprime toutes les données cachées (sign-out complet) */
export function clearAllCache(): void {
  if (!safe()) return;
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(PREFIX)) toRemove.push(k);
  }
  toRemove.forEach(k => localStorage.removeItem(k));
}
