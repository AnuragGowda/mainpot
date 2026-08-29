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
 * Normalizes pasted input into a 6-character room code: uppercases,
 * strips whitespace, and extracts the first run of 6 allowed characters
 * (e.g. from a full URL or pasted text). Returns "" when no valid code
 * is found.
 */
export function normalizeRoomCode(input: string): string {
  const cleaned = input.toUpperCase().replace(/\s+/g, "");
  const match = cleaned.match(/[A-HJ-NP-Z2-9]{6}/);
  return match ? match[0] : "";
}