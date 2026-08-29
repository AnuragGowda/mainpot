"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { joinGame } from "@/lib/data";
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
      await joinGame(normalizedCode, trimmedName);
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
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-16 sm:px-6">
      <div className="w-full max-w-md">
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-gray-500 transition-colors duration-150 hover:text-gray-900"
        >
          <span aria-hidden="true">←</span>
          Back
        </Link>
        <Card padding="lg">
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
            Join a game
          </h1>
          <p className="mt-1.5 text-sm text-gray-500">
            Enter the room code your host shared with you.
          </p>

          <form onSubmit={handleSubmit} noValidate className="mt-8 space-y-5">
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
              className="font-mono uppercase tracking-[0.2em]"
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
        </Card>
      </div>
    </main>
  );
}