"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select";
import GameSetupShell from "@/components/GameSetupShell";
import { useToast } from "@/components/ui/Toast";
import { createGame, getGame, recordGameEvent } from "@/lib/data";
import { getGameTemplates, saveGameTemplate, type GameTemplate } from "@/lib/account-data";
import { getCurrentUser, getCurrentUserId } from "@/lib/auth-client";
import { trackProductOpsEvent } from "@/lib/product-ops";
import { getPlayerName, getSessionId, setActiveGame, setPlayerName } from "@/lib/session";
import { markPostGameEntry } from "@/lib/push-client";
import {
  GAME_NAME_MAX_LENGTH,
  PLAYER_NAME_MAX_LENGTH,
  validateGameName,
  validatePlayerName,
} from "@/lib/name-validation";

interface FormErrors {
  name?: string;
  gameName?: string;
  buyIn?: string;
}

function toNumericAmount(value: string) {
  const numericCharacters = value.replace(/[^0-9.]/g, "");
  const [whole, ...decimalParts] = numericCharacters.split(".");

  return decimalParts.length ? `${whole}.${decimalParts.join("")}` : whole;
}

export default function CreateGamePage() {
  const router = useRouter();
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [gameName, setGameName] = useState("");
  const [buyIn, setBuyIn] = useState("");
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
        if (isHost) {
          await recordGameEvent(game.id, "host_returned_to_create");
          trackProductOpsEvent("host.returned_to_create", {}, game.id);
        }
      }).catch(() => undefined);
    }
    const params = new URLSearchParams(window.location.search);
    const suggestedName = params.get("name")?.trim().slice(0, GAME_NAME_MAX_LENGTH);
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
    nextErrors.name = validatePlayerName(trimmedName) ?? undefined;
    nextErrors.gameName = validateGameName(trimmedGameName) ?? undefined;
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
        userId
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
      markPostGameEntry(code);
      window.sessionStorage.setItem("ante_post_create_source_game", code);
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
                <Select
                  onValueChange={(value) => {
                    const template = templates.find((item) => item.id === value);
                    if (!template) return;
                    setGameName(template.game_name);
                    setBuyIn(String(template.buy_in_amount));
                    setPreferredRoster(template.preferred_roster.join(", "));
                  }}
                >
                  <SelectTrigger id="create-template" className="mt-2">
                    <SelectValue placeholder="Choose a template" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((template) => <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </label>
            ) : null}
            <Input
              id="create-name"
              label="Your name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Mike"
              autoComplete="name"
              maxLength={PLAYER_NAME_MAX_LENGTH}
              error={errors.name}
            />
            <Input
              id="create-game-name"
              label="Game name"
              value={gameName}
              onChange={(event) => setGameName(event.target.value)}
              placeholder="Friday Night at Mike's"
              maxLength={GAME_NAME_MAX_LENGTH}
              error={errors.gameName}
            />
            <Input
              id="create-buy-in"
              label="Buy-in amount"
              type="text"
              min={1}
              step={0.01}
              inputMode="decimal"
              pattern="[0-9]*[.]?[0-9]*"
              prefix="$"
              value={buyIn}
              onChange={(event) => setBuyIn(toNumericAmount(event.target.value))}
              placeholder="20"
              error={errors.buyIn}
            />
            <p className="rounded-lg border border-emerald-100 bg-emerald-50 px-3.5 py-3 text-sm leading-6 text-emerald-900">
              Creating the table automatically records your opening buy-in{buyIn && Number(buyIn) > 0 ? ` of $${Number(buyIn).toFixed(2)}` : ""}. You can add rebuys after the game starts.
            </p>
            {canSaveTemplate ? <div className="rounded-lg border border-gray-200 bg-gray-50 p-3.5">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-gray-800">
                <input type="checkbox" checked={saveTemplate} onChange={(event) => setSaveTemplate(event.target.checked)} className="h-4 w-4 rounded border-gray-300" />
                Save these details as a recurring game
              </label>
              {saveTemplate ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Input label="Template name" value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="Friday game" maxLength={GAME_NAME_MAX_LENGTH} />
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
