"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import GameSetupShell from "@/components/GameSetupShell";
import { useToast } from "@/components/ui/Toast";
import { createGame, getGame, recordGameEvent } from "@/lib/data";
import { getGameTemplates, saveGameTemplate, type GameTemplate } from "@/lib/account-data";
import type { AcquisitionSource } from "@/lib/types";
import { getCurrentUser, getCurrentUserId } from "@/lib/auth-client";
import { getPlayerName, getSessionId, setActiveGame, setPlayerName } from "@/lib/session";

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
  const [acquisitionSource, setAcquisitionSource] = useState<AcquisitionSource | "">("");
  const [templates, setTemplates] = useState<GameTemplate[]>([]);
  const [canSaveTemplate, setCanSaveTemplate] = useState(false);
  const [saveTemplate, setSaveTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [preferredRoster, setPreferredRoster] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setName(getPlayerName() ?? "");
    const previousGame = window.localStorage.getItem("ante_active_game");
    if (previousGame && !window.sessionStorage.getItem(`returned:${previousGame}`)) {
      window.sessionStorage.setItem(`returned:${previousGame}`, "1");
      void getGame(previousGame).then(async (game) => {
        if (!game || game.status !== "ended") return;
        const userId = await getCurrentUserId();
        const isHost = game.host_user_id
          ? game.host_user_id === userId
          : game.host_session_id === getSessionId();
        if (isHost) await recordGameEvent(game.id, "host_returned_to_create");
      }).catch(() => undefined);
    }
    const params = new URLSearchParams(window.location.search);
    const suggestedName = params.get("name")?.trim().slice(0, 80);
    const suggestedBuyIn = Number(params.get("buyin"));
    if (suggestedName) setGameName(suggestedName);
    if (Number.isFinite(suggestedBuyIn) && suggestedBuyIn > 0) {
      setBuyIn(String(suggestedBuyIn));
    }
    void getCurrentUser().then((currentUser) => {
      if (currentUser && !currentUser.is_anonymous) {
        setCanSaveTemplate(true);
        return getGameTemplates(currentUser.id).then(setTemplates);
      }
    }).catch(() => undefined);
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
      const userId = await getCurrentUserId();
      const { code } = await createGame(
        trimmedGameName,
        trimmedName,
        parsedBuyIn,
        userId,
        acquisitionSource || null
      );
      if (saveTemplate && canSaveTemplate && userId) {
        try {
          await saveGameTemplate({
            userId,
            name: templateName.trim() || trimmedGameName,
            gameName: trimmedGameName,
            buyInAmount: parsedBuyIn,
            preferredRoster: preferredRoster.split(","),
          });
        } catch {
          toast("Game created, but the recurring template could not be saved.", "error");
        }
      }
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
    <GameSetupShell
      eyebrow="Host a table"
      title="Start a game. Share one code."
      description="Set the buy-in and create a ledger everyone at the table can follow."
    >
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-gray-950">Game details</h2>
              <p className="mt-1 text-sm text-gray-500">You can edit buy-ins during the game.</p>
            </div>
            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">Host</span>
          </div>

          <form onSubmit={handleSubmit} noValidate className="mt-7 space-y-5">
            {templates.length ? (
              <label htmlFor="create-template" className="block text-sm font-medium text-gray-700">
                Start from a recurring game <span className="font-normal text-gray-400">(optional)</span>
                <select
                  id="create-template"
                  defaultValue=""
                  onChange={(event) => {
                    const template = templates.find((item) => item.id === event.target.value);
                    if (!template) return;
                    setGameName(template.game_name);
                    setBuyIn(String(template.buy_in_amount));
                    setPreferredRoster(template.preferred_roster.join(", "));
                  }}
                  className="mt-2 h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-gray-900 focus:border-gray-950 focus:outline-none focus:ring-2 focus:ring-gray-950/10"
                >
                  <option value="">Choose a template</option>
                  {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
                </select>
              </label>
            ) : null}
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
            <label htmlFor="create-source" className="block text-sm font-medium text-gray-700">
              How did you hear about Mainpot? <span className="font-normal text-gray-400">(optional)</span>
              <select id="create-source" value={acquisitionSource} onChange={(event) => setAcquisitionSource(event.target.value as AcquisitionSource | "")}
                className="mt-2 h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-gray-900 focus:border-gray-950 focus:outline-none focus:ring-2 focus:ring-gray-950/10">
                <option value="">Choose one</option>
                <option value="personal_invite">Personal invite</option>
                <option value="poker_group">Poker group</option>
                <option value="search">Search</option>
                <option value="other">Other</option>
              </select>
            </label>
            {canSaveTemplate ? <div className="rounded-lg border border-gray-200 bg-gray-50 p-3.5">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-gray-800">
                <input type="checkbox" checked={saveTemplate} onChange={(event) => setSaveTemplate(event.target.checked)} className="h-4 w-4 rounded border-gray-300" />
                Save these details as a recurring game
              </label>
              {saveTemplate ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Input label="Template name" value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="Friday game" />
                  <Input label="Preferred roster" value={preferredRoster} onChange={(event) => setPreferredRoster(event.target.value)} placeholder="Alex, Sam, Jordan" />
                </div>
              ) : null}
              {saveTemplate ? <p className="mt-2 text-xs leading-5 text-gray-500">Roster names are a reminder for the host; players still join with the private game link.</p> : null}
            </div> : null}
            <Button type="submit" fullWidth loading={loading}>
              Create game
            </Button>
          </form>
          <p className="mt-4 text-center text-xs leading-5 text-gray-400">
            You’ll get a private six-character code to share.
          </p>
    </GameSetupShell>
  );
}
