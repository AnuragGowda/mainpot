const SESSION_ID_KEY = "ante_session_id";
const PLAYER_NAME_KEY = "ante_player_name";
const ACTIVE_GAME_KEY = "ante_active_game";

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

export function setActiveGame(code: string): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(ACTIVE_GAME_KEY, code);
}

export function clearActiveGame(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(ACTIVE_GAME_KEY);
}