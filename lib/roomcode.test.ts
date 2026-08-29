import { describe, expect, it } from "vitest";
import { generateRoomCode, normalizeRoomCode } from "./roomcode";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

describe("generateRoomCode", () => {
  it("generates codes of length 6", () => {
    for (let i = 0; i < 50; i++) {
      expect(generateRoomCode()).toHaveLength(6);
    }
  });

  it("only uses unambiguous characters (no O/0/I/1)", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateRoomCode();
      for (const char of code) {
        expect(ALPHABET).toContain(char);
      }
    }
  });
});

describe("normalizeRoomCode", () => {
  it("extracts the last path segment from a full URL", () => {
    expect(normalizeRoomCode("https://ante.app/game/ABC234")).toBe("ABC234");
  });

  it("uppercases lowercase input", () => {
    expect(normalizeRoomCode("abc234")).toBe("ABC234");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeRoomCode("  ABC234 ")).toBe("ABC234");
  });

  it("ignores query strings", () => {
    expect(normalizeRoomCode("https://ante.app/game/ABC234?x=1")).toBe(
      "ABC234"
    );
  });
});