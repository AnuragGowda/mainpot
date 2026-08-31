const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_CODE_LENGTH = 6;

/**
 * Generates a 6-character room code from an alphabet that excludes
 * ambiguous characters (O, 0, I, 1). Uses crypto.getRandomValues when
 * available, falling back to Math.random.
 */
export function generateRoomCode(): string {
  const chars: string[] = new Array(ROOM_CODE_LENGTH);

  if (
    typeof crypto !== "undefined" &&
    typeof crypto.getRandomValues === "function"
  ) {
    const values = new Uint32Array(ROOM_CODE_LENGTH);
    crypto.getRandomValues(values);
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
      chars[i] = ROOM_CODE_ALPHABET[values[i] % ROOM_CODE_ALPHABET.length];
    }
  } else {
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
      chars[i] =
        ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
    }
  }

  return chars.join("");
}

/**
 * Normalizes pasted input into a 6-character room code.
 *
 * Strategy (robust to pasted URLs, paths, and stray text):
 * 1. Trim + uppercase.
 * 2. Strip any query string / hash fragment.
 * 3. Split on "/" and "\" — when segments exist, the LAST segment is the
 *    candidate (so "https://mainpot.app/game/ABC123" yields "ABC123"); otherwise
 *    the whole (query-stripped) string is the candidate.
 * 4. Remove every character that cannot appear in a generated code.
 * 5. Extract the first run of exactly 6 allowed characters.
 *
 * Fallback: if no strict 6-char run exists but the candidate contains a plain
 * 6-char alphanumeric token, accept that token verbatim. Room codes are
 * generated only from the strict alphabet, so a hand-shared code like
 * "ABC123" may contain a lookalike digit (1) — treat it as given and let the
 * lookup decide. Returns "" when no plausible code is found.
 */
export function normalizeRoomCode(input: string): string {
  const trimmed = input.trim().toUpperCase();
  const withoutQuery = trimmed.split(/[?#]/)[0];
  const segments = withoutQuery.split(/[/\\]/).filter((segment) => segment.length > 0);
  const candidate = segments.length > 0 ? segments[segments.length - 1] : withoutQuery;
  const allowedOnly = candidate.replace(/[^A-HJ-NP-Z2-9]/g, "");
  const match = allowedOnly.match(/[A-HJ-NP-Z2-9]{6}/);
  if (match) {
    return match[0];
  }
  const token = candidate.match(/[A-Z0-9]{6}/);
  return token ? token[0] : "";
}
