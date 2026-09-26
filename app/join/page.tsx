"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import GameSetupShell from "@/components/GameSetupShell";
import { useToast } from "@/components/ui/Toast";
import { getGame, joinGame, usingLocalStorage } from "@/lib/data";
import { getCurrentUserId } from "@/lib/auth-client";
import { formatCurrency } from "@/lib/format";
import { normalizeRoomCode } from "@/lib/roomcode";
import { getPlayerName, setActiveGame, setPlayerName } from "@/lib/session";
import { markPostGameEntry } from "@/lib/push-client";
import { PLAYER_NAME_MAX_LENGTH, validatePlayerName } from "@/lib/name-validation";
import type { Game } from "@/lib/types";

interface FormErrors {
  name?: string;
  code?: string;
}

type JoinPreview = Pick<Game, "code" | "name" | "host_name" | "buy_in_amount" | "status">;

function joinFailureMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Something went wrong. Please try again.";
  if (message === "Game not found.") return "Game not found. Check the code and try again.";
  if (message === "This game has already ended.") return "This game has already ended.";
  return message;
}

export default function JoinGamePage() {
  const router = useRouter();
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [ready, setReady] = useState(false);
  const [code, setCode] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [joinError, setJoinError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<JoinPreview | null>(null);
  const localOnly = usingLocalStorage();

  useEffect(() => {
    setName((current) => current || getPlayerName() || "");
    setReady(true);
  }, []);

  function handleCodeChange(value: string) {
    setJoinError(null);
    setPreview(null);
    // A pasted URL (e.g. ".../game/ABC123") extracts to the room code;
    // otherwise keep a typing-friendly partial: uppercase, drop characters
    // that can never appear in a code, cap at 6 characters.
    const extracted = normalizeRoomCode(value);
    if (extracted) {
      setCode(extracted);
      return;
    }
    setCode(value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, "").slice(0, 6));
  }

  function validateDetails() {
    const trimmedName = name.trim();
    const normalizedCode = normalizeRoomCode(code);

    const nextErrors: FormErrors = {};
    nextErrors.name = validatePlayerName(trimmedName) ?? undefined;
    if (!normalizedCode) {
      nextErrors.code = "Enter the 6-character room code.";
    }
    setErrors(nextErrors);
    setJoinError(null);
    if (nextErrors.name || nextErrors.code) {
      document.getElementById(nextErrors.name ? "join-name" : "join-code")?.focus();
      return null;
    }
    return { trimmedName, normalizedCode };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const details = validateDetails();
    if (!details) return;

    setLoading(true);
    try {
      const game = await getGame(details.normalizedCode);
      if (!game) throw new Error("Game not found.");
      if (game.status !== "active") throw new Error("This game has already ended.");
      setPreview(game);
    } catch (err) {
      setJoinError(joinFailureMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function confirmJoin() {
    const details = validateDetails();
    if (!details || !preview || preview.code !== details.normalizedCode) return;

    setLoading(true);
    try {
      setPlayerName(details.trimmedName);
      const userId = await getCurrentUserId();
      await joinGame(details.normalizedCode, details.trimmedName, userId);
      setActiveGame(details.normalizedCode);
      markPostGameEntry(details.normalizedCode);
      toast("Joined the game!", "success");
      router.push(`/game/${details.normalizedCode}`);
    } catch (err) {
      setJoinError(joinFailureMessage(err));
      setLoading(false);
    }
  }

  return (
    <GameSetupShell
      eyebrow="Join the table"
      title="Join your table."
      description="Enter the host’s six-character code or paste an invite link. Review the table and opening buy-in before joining."
    >
          <form aria-label="Join a game" onSubmit={handleSubmit} noValidate className="space-y-5">
            <Input
              disabled={!ready}
              id="join-name"
              label="Your name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Mike"
              autoComplete="name"
              maxLength={PLAYER_NAME_MAX_LENGTH}
              error={errors.name}
            />
            <Input
              disabled={!ready}
              id="join-code"
              label="Room code"
              value={code}
              onChange={(event) => handleCodeChange(event.target.value)}
              onBlur={() => {
                const extracted = normalizeRoomCode(code);
                if (extracted && extracted !== code) {
                  setPreview(null);
                  setCode(extracted);
                }
              }}
              placeholder="ABC234"
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="characters"
              className="h-14 text-center font-mono text-xl font-semibold uppercase tracking-[0.28em]"
              error={errors.code}
            />
            {joinError ? (
              <p role="alert" className="text-sm text-red-600">
                {joinError}
              </p>
            ) : null}
            {preview ? (
              <section aria-label="Confirm table details" className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-600">Confirm your table</p>
                <h2 className="mt-1 break-words text-lg font-semibold text-gray-950">{preview.name}</h2>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-gray-600">Host</dt>
                    <dd className="mt-0.5 font-medium text-gray-950">{preview.host_name}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-600">Opening buy-in</dt>
                    <dd className="mt-0.5 font-medium text-gray-950">{formatCurrency(preview.buy_in_amount)}</dd>
                  </div>
                </dl>
                <p className="mt-3 text-sm leading-6 text-gray-700">
                  Your opening buy-in will be pending host approval.
                </p>
                <Button type="button" fullWidth loading={loading} onClick={confirmJoin} className="mt-4">
                  Join and record {formatCurrency(preview.buy_in_amount)} buy-in
                </Button>
              </section>
            ) : (
              <Button type="submit" fullWidth loading={loading} disabled={!ready}>
                Continue to table details
              </Button>
            )}
            {localOnly ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-5 text-amber-900">
                Local-only tables are saved only in the host&apos;s browser. Other devices can&apos;t join until sync is configured.
              </p>
            ) : null}
          </form>
          <p className="mt-4 text-center text-xs leading-5 text-gray-600">
            Codes never use 0, 1, I, or O.
          </p>
    </GameSetupShell>
  );
}
