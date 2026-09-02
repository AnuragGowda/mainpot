import { describe, expect, it } from "vitest";
import {
  GAME_NAME_MAX_LENGTH,
  PLAYER_NAME_MAX_LENGTH,
  validateDisplayName,
  validateGameName,
  validatePlayerName,
  validateUsername,
  normalizeZelleContact,
  validateZelleContact,
} from "./name-validation";

describe("human-facing name validation", () => {
  it("accepts international names and ordinary punctuation", () => {
    expect(validatePlayerName("José O’Neill")).toBeNull();
    expect(validatePlayerName("李 小龍")).toBeNull();
    expect(validateGameName("Élodie’s Friday Game ♠")).toBeNull();
  });

  it("enforces the game and player limits", () => {
    expect(validateGameName("G".repeat(GAME_NAME_MAX_LENGTH))).toBeNull();
    expect(validateGameName("G".repeat(GAME_NAME_MAX_LENGTH + 1))).toBe(
      "Game name must be 40 characters or fewer.",
    );
    expect(validatePlayerName("P".repeat(PLAYER_NAME_MAX_LENGTH))).toBeNull();
    expect(validatePlayerName("P".repeat(PLAYER_NAME_MAX_LENGTH + 1))).toBe(
      "Player name must be 32 characters or fewer.",
    );
  });

  it("rejects line breaks and control characters", () => {
    expect(validateGameName("Friday\nGame")).toBe(
      "Game name cannot contain line breaks or control characters.",
    );
    expect(validatePlayerName("Alex\u0000Smith")).toBe(
      "Player name cannot contain line breaks or control characters.",
    );
  });

  it("allows an empty optional display name but still validates its contents", () => {
    expect(validateDisplayName("  ")).toBeNull();
    expect(validateDisplayName("A".repeat(PLAYER_NAME_MAX_LENGTH + 1))).toBe(
      "Display name must be 32 characters or fewer.",
    );
  });
});

describe("username validation", () => {
  it("keeps usernames optional and accepts normalized handle characters", () => {
    expect(validateUsername("")).toBeNull();
    expect(validateUsername("pocket_aces24")).toBeNull();
  });

  it("rejects non-ASCII handles and values outside 3–24 characters", () => {
    expect(validateUsername("ab")).not.toBeNull();
    expect(validateUsername("a".repeat(25))).not.toBeNull();
    expect(validateUsername("élodie")).not.toBeNull();
    expect(validateUsername("pocket-aces")).not.toBeNull();
  });
});

describe("Zelle contact validation", () => {
  it("accepts an email address or U.S. mobile number", () => {
    expect(validateZelleContact("")).toBeNull();
    expect(validateZelleContact("alex@example.com")).toBeNull();
    expect(validateZelleContact("(312) 555-1234")).toBeNull();
    expect(normalizeZelleContact("(312) 555-1234")).toBe("+13125551234");
    expect(normalizeZelleContact("+1 312 555 1234")).toBe("+13125551234");
  });

  it("rejects non-contact text and non-U.S. phone numbers", () => {
    expect(validateZelleContact("alex at example dot com")).not.toBeNull();
    expect(validateZelleContact("555-1234")).not.toBeNull();
    expect(validateZelleContact("+44 20 7946 0958")).not.toBeNull();
  });
});
