"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { joinGame } from "@/lib/data";
import { getCurrentUserId } from "@/lib/auth-client";
import { getPlayerName, setPlayerName } from "@/lib/session";

export interface JoinPromptProps {
  code: string;
  onJoined: () => void;
}

export default function JoinPrompt({ code, onJoined }: JoinPromptProps) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setName(getPlayerName() ?? "");
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Enter your name to join.");
      return;
    }

    setError(null);
    setLoading(true);
    try {
      setPlayerName(trimmedName);
      const userId = await getCurrentUserId();
      await joinGame(code, trimmedName, userId);
      toast("Joined!", "success");
      onJoined();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong. Please try again.";
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <Card padding="lg" className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
          Join this game
        </h1>
        <p className="mt-1.5 text-sm text-gray-500">
          Room code{" "}
          <span className="font-mono font-semibold tracking-[0.2em] text-gray-900">
            {code}
          </span>
        </p>

        <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
          <Input
            id="join-prompt-name"
            label="Your name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Mike"
            autoComplete="name"
            error={error ?? undefined}
          />
          <Button type="submit" fullWidth loading={loading}>
            Join
          </Button>
          <Button
            type="button"
            variant="ghost"
            fullWidth
            onClick={onJoined}
            aria-label="View the room without joining"
          >
            View as spectator
          </Button>
        </form>
      </Card>
    </div>
  );
}