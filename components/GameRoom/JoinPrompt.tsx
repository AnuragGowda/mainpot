"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { joinGame } from "@/lib/data";
import { getCurrentUserId } from "@/lib/auth-client";
import { getPlayerName, setPlayerName } from "@/lib/session";
import { markPostGameEntry } from "@/lib/push-client";
import { formatCurrency } from "@/lib/format";
import type { Game } from "@/lib/types";
import { PLAYER_NAME_MAX_LENGTH, validatePlayerName } from "@/lib/name-validation";

export interface JoinPromptProps {
  game: Pick<Game, "code" | "name" | "host_name" | "buy_in_amount">;
  onJoined: () => void;
  onSpectate: () => void;
}

export default function JoinPrompt({
  game,
  onJoined,
  onSpectate,
}: JoinPromptProps) {
  const { toast } = useToast();
  const dialogRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setName(getPlayerName() ?? "");
  }, []);

  useEffect(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const focusName = () => nameInputRef.current?.focus();
    const frame = window.requestAnimationFrame(focusName);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onSpectate();
        return;
      }

      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [href], select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, [onSpectate]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    const nameError = validatePlayerName(trimmedName, "Enter your name to join.");
    if (nameError) {
      setError(nameError);
      return;
    }

    setError(null);
    setLoading(true);
    try {
      setPlayerName(trimmedName);
      const userId = await getCurrentUserId();
      await joinGame(game.code, trimmedName, userId);
      markPostGameEntry(game.code);
      toast("Joined!", "success");
      onJoined();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again.";
      if (message === "Game not found.") {
        setError("Game not found. Check the code and try again.");
      } else if (message === "This game has already ended.") {
        setError("This game has already ended.");
      } else {
        setError(message);
      }
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="join-game-title"
        aria-describedby="join-game-details"
        className="w-full sm:max-w-sm"
      >
        <Card padding="lg" className="w-full rounded-b-none sm:rounded-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
            Join the table
          </p>
          <h1
            id="join-game-title"
            className="mt-1 break-words text-2xl font-semibold tracking-tight text-gray-900"
          >
            {game.name}
          </h1>
          <div
            id="join-game-details"
            className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-gray-50 p-3 text-sm"
          >
            <p className="min-w-0 text-gray-600">
              Host{" "}
              <span className="block truncate font-medium text-gray-900">
                {game.host_name}
              </span>
            </p>
            <p className="text-gray-600">
              Buy-in{" "}
              <span className="block font-medium text-gray-900">
                {formatCurrency(game.buy_in_amount)}
              </span>
            </p>
            <p className="col-span-2 text-gray-600">
              Room code{" "}
              <span className="ml-1 font-mono font-semibold tracking-[0.16em] text-gray-900">
                {game.code}
              </span>
            </p>
          </div>

          <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
            <Input
              id="join-prompt-name"
              ref={nameInputRef}
              label="Your name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Mike"
              autoComplete="name"
              maxLength={PLAYER_NAME_MAX_LENGTH}
              error={error ?? undefined}
            />
            <Button type="submit" fullWidth loading={loading}>
              Join
            </Button>
            <Button
              type="button"
              variant="ghost"
              fullWidth
              onClick={onSpectate}
              aria-label="View the room without joining"
            >
              View as spectator
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
