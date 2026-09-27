const SESSION_ID_KEY = "ante_session_id";
const PLAYER_NAME_KEY = "ante_player_name";
const ACTIVE_GAME_KEY = "ante_active_game";
const ACTIVE_GAMES_KEY = "ante_active_games";
const MAX_RECOVERABLE_GAMES = 3;
export const ACTIVE_GAMES_CHANGED = "mainpot:active-games-changed";

/**
 * Returns a random UUID v4 using crypto.randomUUID() when available,
 * falling back to a Math.random-based manual UUID v4.
 */
export function randomUUID(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const r = (Math.random() * 16) | 0;
    const v = char === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Returns the existing session id for this browser, or generates and
 * persists a new one. Stored in localStorage under "ante_session_id".
 */
export function getSessionId(): string {
  if (typeof window === "undefined") {
    return randomUUID();
  }

  let sessionId = window.localStorage.getItem(SESSION_ID_KEY);
  if (!sessionId) {
    sessionId = randomUUID();
    window.localStorage.setItem(SESSION_ID_KEY, sessionId);
  }
  return sessionId;
}

export function getPlayerName(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(PLAYER_NAME_KEY);
}

export function setPlayerName(name: string): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(PLAYER_NAME_KEY, name);
}

export function getActiveGame(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(ACTIVE_GAME_KEY);
}

/**
 * Returns the recent room codes this device can resume. The legacy single
 * value remains for existing installs and for callers that need one default.
 */
export function getActiveGames(): string[] {
  if (typeof window === "undefined") return [];
  const fallback = window.localStorage.getItem(ACTIVE_GAME_KEY);
  try {
    const raw = window.localStorage.getItem(ACTIVE_GAMES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const codes = Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string" && value.length > 0)
      : [];
    return Array.from(new Set([...(fallback ? [fallback] : []), ...codes])).slice(0, MAX_RECOVERABLE_GAMES);
  } catch {
    return fallback ? [fallback] : [];
  }
}

export function setActiveGame(code: string): void {
  if (typeof window === "undefined") {
    return;
  }
  const next = [code, ...getActiveGames().filter((existing) => existing !== code)]
    .slice(0, MAX_RECOVERABLE_GAMES);
  const previous = window.localStorage.getItem(ACTIVE_GAMES_KEY);
  const previousActive = getActiveGame();
  window.localStorage.setItem(ACTIVE_GAME_KEY, code);
  window.localStorage.setItem(ACTIVE_GAMES_KEY, JSON.stringify(next));
  if (previous !== JSON.stringify(next) || previousActive !== code) window.dispatchEvent(new Event(ACTIVE_GAMES_CHANGED));
}

export function clearActiveGame(code?: string): void {
  if (typeof window === "undefined") {
    return;
  }
  const previous = getActiveGames();
  const remaining = code ? previous.filter((existing) => existing !== code) : [];
  if (code && previous.length === remaining.length) return;
  if (remaining.length) {
    window.localStorage.setItem(ACTIVE_GAME_KEY, remaining[0]);
    window.localStorage.setItem(ACTIVE_GAMES_KEY, JSON.stringify(remaining));
    window.dispatchEvent(new Event(ACTIVE_GAMES_CHANGED));
    return;
  }
  window.localStorage.removeItem(ACTIVE_GAME_KEY);
  window.localStorage.removeItem(ACTIVE_GAMES_KEY);
  if (previous.length) window.dispatchEvent(new Event(ACTIVE_GAMES_CHANGED));
}
