export const GAME_NAME_MAX_LENGTH = 40;
export const PLAYER_NAME_MAX_LENGTH = 32;
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 24;

const DISALLOWED_NAME_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u;
const USERNAME_PATTERN = /^[a-z0-9_]{3,24}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const US_PHONE_CHARACTERS_PATTERN = /^[0-9+().\-\s]+$/;

interface HumanNameOptions {
  label: "Game name" | "Player name" | "Display name";
  maxLength: number;
  requiredMessage?: string;
  optional?: boolean;
}

/**
 * Human-facing names stay Unicode-friendly. Only invisible control characters
 * and line breaks are rejected; React safely renders punctuation as text.
 */
export function validateHumanName(
  value: string,
  { label, maxLength, requiredMessage, optional = false }: HumanNameOptions,
): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return optional ? null : (requiredMessage ?? `Enter a ${label.toLowerCase()}.`);
  }
  if (DISALLOWED_NAME_CHARACTERS.test(value)) {
    return `${label} cannot contain line breaks or control characters.`;
  }
  if (Array.from(trimmed).length > maxLength) {
    return `${label} must be ${maxLength} characters or fewer.`;
  }
  return null;
}

export function validateGameName(value: string): string | null {
  return validateHumanName(value, {
    label: "Game name",
    maxLength: GAME_NAME_MAX_LENGTH,
    requiredMessage: "Enter a game name.",
  });
}

export function validatePlayerName(
  value: string,
  requiredMessage = "Enter your name.",
): string | null {
  return validateHumanName(value, {
    label: "Player name",
    maxLength: PLAYER_NAME_MAX_LENGTH,
    requiredMessage,
  });
}

export function validateDisplayName(value: string): string | null {
  return validateHumanName(value, {
    label: "Display name",
    maxLength: PLAYER_NAME_MAX_LENGTH,
    optional: true,
  });
}

export function validateUsername(value: string): string | null {
  const normalized = value.trim().replace(/^@/, "").toLowerCase();
  if (!normalized) return null;
  return USERNAME_PATTERN.test(normalized)
    ? null
    : `Username must be ${USERNAME_MIN_LENGTH}–${USERNAME_MAX_LENGTH} lowercase letters, numbers, or underscores.`;
}

/**
 * Zelle recipients can be identified by an enrolled email address or a U.S.
 * mobile number. Store phone numbers consistently so payment instructions are
 * unambiguous, while leaving email addresses intact.
 */
export function normalizeZelleContact(value: string): string {
  const trimmed = value.trim();
  if (EMAIL_PATTERN.test(trimmed)) return trimmed;

  if (!US_PHONE_CHARACTERS_PATTERN.test(trimmed)) return trimmed;
  const digits = trimmed.replace(/\D/g, "");
  const nationalNumber = digits.length === 11 && digits.startsWith("1")
    ? digits.slice(1)
    : digits;

  return /^[2-9]\d{2}[2-9]\d{6}$/.test(nationalNumber)
    ? `+1${nationalNumber}`
    : trimmed;
}

export function validateZelleContact(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (EMAIL_PATTERN.test(trimmed)) return null;

  const normalized = normalizeZelleContact(trimmed);
  return /^\+1[2-9]\d{2}[2-9]\d{6}$/.test(normalized)
    ? null
    : "Enter an email address or a valid U.S. mobile number.";
}
