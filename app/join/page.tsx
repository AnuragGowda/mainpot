"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import GameSetupShell from "@/components/GameSetupShell";
import { useToast } from "@/components/ui/Toast";
import { joinGame } from "@/lib/data";
import { getCurrentUserId } from "@/lib/auth-client";
import { normalizeRoomCode } from "@/lib/roomcode";
import { getPlayerName, setActiveGame, setPlayerName } from "@/lib/session";

interface FormErrors {
  name?: string;
  code?: string;
}

export default function JoinGamePage() {
  const router = useRouter();
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [joinError, setJoinError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setName(getPlayerName() ?? "");
  }, []);

  function handleCodeChange(value: string) {
    setJoinError(null);
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedName = name.trim();
    const normalizedCode = normalizeRoomCode(code);

    const nextErrors: FormErrors = {};
    if (!trimmedName) {
      nextErrors.name = "Enter your name.";
    }
    if (!normalizedCode) {
      nextErrors.code = "Enter the 6-character room code.";
    }
    setErrors(nextErrors);
    setJoinError(null);
    if (nextErrors.name || nextErrors.code) {
      return;
    }

    setLoading(true);
    try {
      setPlayerName(trimmedName);
      const userId = await getCurrentUserId();
      await joinGame(normalizedCode, trimmedName, userId);
      setActiveGame(normalizedCode);
      toast("Joined the game!", "success");
      router.push(`/game/${normalizedCode}`);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again.";
      if (message === "Game not found.") {
        setJoinError("Game not found. Check the code and try again.");
      } else if (message === "This game has already ended.") {
        setJoinError("This game has already ended.");
      } else {
        setJoinError(message);
      }
      setLoading(false);
    }
  }

  return (
    <GameSetupShell
      eyebrow="Join the table"
      title="One code. You’re in."
      description="Use the private room code from your host. Your buy-ins and rebuys will appear in the shared game ledger."
    >
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-gray-950">Enter your invite</h2>
            <p className="mt-1 text-sm text-gray-500">Codes are six characters and never use 0, 1, I, or O.</p>
          </div>

          <form onSubmit={handleSubmit} noValidate className="mt-7 space-y-5">
            <Input
              id="join-name"
              label="Your name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Mike"
              autoComplete="name"
              error={errors.name}
            />
            <Input
              id="join-code"
              label="Room code"
              value={code}
              onChange={(event) => handleCodeChange(event.target.value)}
              onBlur={() => {
                const extracted = normalizeRoomCode(code);
                if (extracted) {
                  setCode(extracted);
                }
              }}
              placeholder="ABC123"
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
            <Button type="submit" fullWidth loading={loading}>
              Join game
            </Button>
          </form>
          <p className="mt-4 text-center text-xs leading-5 text-gray-400">
            You can also paste the full invite link here.
          </p>
    </GameSetupShell>
  );
}
