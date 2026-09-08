import { defaultRecapPrivacy, type RecapPrivacy } from './recap';

// Memory fallback keeps reopens stable even when browser storage is unavailable.
const seen = new Set<string>();
const preferences = new Map<string, RecapPrivacy>();
export const recapSessionKey = (gameId: string, playerId?: string) => JSON.stringify([gameId, playerId ?? null]);

export function hasSeenRecap(key: string): boolean {
  try { return seen.has(key) || sessionStorage.getItem(`mainpot:reveal:v1:${key}`) === 'seen'; }
  catch { return seen.has(key); }
}

export function rememberRecap(key: string) {
  seen.add(key);
  try { sessionStorage.setItem(`mainpot:reveal:v1:${key}`, 'seen'); } catch { /* Memory fallback. */ }
}

export function readRecapPrivacy(key: string): RecapPrivacy {
  if (preferences.has(key)) return preferences.get(key)!;
  try {
    const raw = sessionStorage.getItem(`mainpot:recap-privacy:v1:${key}`);
    if (raw) {
      const saved = JSON.parse(raw);
      const result = { ...defaultRecapPrivacy, hiddenPlayerIds: [] as string[] };
      for (const field of ['showResult', 'showPlayerCount', 'showDuration', 'showRebuys', 'showDollarAmounts', 'showLosses'] as const) {
        if (typeof saved?.[field] === 'boolean') result[field] = saved[field];
      }
      if (Array.isArray(saved?.hiddenPlayerIds)) result.hiddenPlayerIds = saved.hiddenPlayerIds.filter((id: unknown): id is string => typeof id === 'string');
      return result;
    }
  } catch { /* Defaults for unavailable or corrupt storage. */ }
  return { ...defaultRecapPrivacy, hiddenPlayerIds: [] };
}

export function rememberRecapPrivacy(key: string, privacy: RecapPrivacy) {
  const safe = { ...privacy, showPlayerNames: false, hiddenPlayerIds: [...privacy.hiddenPlayerIds] };
  preferences.set(key, safe);
  try { sessionStorage.setItem(`mainpot:recap-privacy:v1:${key}`, JSON.stringify(safe)); } catch { /* Memory fallback. */ }
}
