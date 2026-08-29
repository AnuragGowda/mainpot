"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { createGame } from "@/lib/data";
import { getPlayerName, setActiveGame, setPlayerName } from "@/lib/session";

interface FormErrors {
  name?: string;
  gameName?: string;
  buyIn?: string;
}

export default function CreateGamePage() {
  const router = useRouter();
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [gameName, setGameName] = useState("");
  const [buyIn, setBuyIn] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setName(getPlayerName() ?? "");
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedName = name.trim();
    const trimmedGameName = gameName.trim();
    const parsedBuyIn = Number(buyIn);

    const nextErrors: FormErrors = {};
    if (!trimmedName) {
      nextErrors.name = "Enter your name.";
    }
    if (!trimmedGameName) {
      nextErrors.gameName = "Enter a game name.";
    }
    if (!buyIn.trim() || !Number.isFinite(parsedBuyIn) || parsedBuyIn <= 0) {
      nextErrors.buyIn = "Enter an amount greater than 0.";
    }
    setErrors(nextErrors);
    if (nextErrors.name || nextErrors.gameName || nextErrors.buyIn) {
      return;
    }

    setLoading(true);
    try {
      setPlayerName(trimmedName);
      const { code } = await createGame(
        trimmedGameName,
        trimmedName,
        parsedBuyIn
      );
      setActiveGame(code);
      toast("Game created!", "success");
      router.push(`/game/${code}`);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again.";
      toast(message, "error");
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
            Create a game
          </h1>
          <p className="mt-1.5 text-sm text-gray-500">
            Set up a game, pick a buy-in, and share the room code.
          </p>

          <form onSubmit={handleSubmit} noValidate className="mt-8 space-y-5">
            <Input
              id="create-name"
              label="Your name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Mike"
              autoComplete="name"
              error={errors.name}
            />
            <Input
              id="create-game-name"
              label="Game name"
              value={gameName}
              onChange={(event) => setGameName(event.target.value)}
              placeholder="Friday Night at Mike's"
              error={errors.gameName}
            />
            <Input
              id="create-buy-in"
              label="Buy-in amount"
              type="number"
              min={1}
              step={0.01}
              inputMode="decimal"
              prefix="$"
              value={buyIn}
              onChange={(event) => setBuyIn(event.target.value)}
              placeholder="20"
              error={errors.buyIn}
            />
            <Button type="submit" fullWidth loading={loading}>
              Create game
            </Button>
          </form>
        </Card>
      </div>
    </main>
  );
}