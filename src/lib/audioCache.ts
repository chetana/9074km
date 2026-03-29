/**
 * Cache audio TTS — évite de re-générer le même audio avec Gemini.
 * Niveau 1 : memCache (Map, session, illimité)
 * Niveau 2 : localStorage (max 30 entrées, LRU)
 */

const MAX = 30;
const LS_KEY = 'lys_audio_cache_v1';

interface CacheEntry { key: string; data: string; ts: number }

const memCache = new Map<string, string>();

function lsLoad(): Map<string, string> {
  if (typeof localStorage === 'undefined') return new Map();
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return new Map();
    const entries: CacheEntry[] = JSON.parse(raw);
    return new Map(entries.map((e) => [e.key, e.data]));
  } catch { return new Map(); }
}

function lsSave() {
  if (typeof localStorage === 'undefined') return;
  try {
    const entries: CacheEntry[] = [...memCache.entries()]
      .slice(-MAX)
      .map(([key, data]) => ({ key, data, ts: Date.now() }));
    localStorage.setItem(LS_KEY, JSON.stringify(entries));
  } catch {}
}

// Hydratation depuis localStorage au démarrage
(function hydrate() {
  lsLoad().forEach((data, key) => memCache.set(key, data));
})();

function cacheKey(text: string, lang: string): string {
  return `${lang}::${text}`;
}

export function getAudioCache(text: string, lang: string): string | null {
  return memCache.get(cacheKey(text, lang)) ?? null;
}

export function setAudioCache(text: string, lang: string, data: string) {
  if (!data) return;
  memCache.set(cacheKey(text, lang), data);
  lsSave();
}
