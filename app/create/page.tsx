"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { ResumeGameCard, type ResumableGame } from "@/components/ResumeBanner";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select";
import GameSetupShell from "@/components/GameSetupShell";
import TemplateManager from "@/components/TemplateManager";
import { useToast } from "@/components/ui/Toast";
import { createGame, getGame, recordGameEvent, usingLocalStorage } from "@/lib/data";
import { getGameTemplates, saveGameTemplate, type GameTemplate } from "@/lib/account-data";
import { getCurrentUser, getCurrentUserId } from "@/lib/auth-client";
import { getProfileById } from "@/lib/friends";
import { classifyProductOpsFailure, trackProductOpsEvent } from "@/lib/product-ops";
import { getActiveGames, getPlayerName, getSessionId, setActiveGame, setPlayerName } from "@/lib/session";
import { markPostGameEntry } from "@/lib/push-client";
import { navigateToFreshAppPage } from "@/lib/navigation";
import {
  GAME_NAME_MAX_LENGTH,
  PLAYER_NAME_MAX_LENGTH,
  validateGameName,
  validatePlayerName,
} from "@/lib/name-validation";

import { withTimeout } from "@/lib/request-timeout";
import { validateCurrencyAmount } from "@/lib/currency-input";

interface FormErrors {
  name?: string;
  gameName?: string;
  buyIn?: string;
}

export default function CreateGamePage() {
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [ready, setReady] = useState(false);
  const nameEdited = useRef(false);
  const creationInFlight = useRef(false);
  const [gameName, setGameName] = useState("");
  const [buyIn, setBuyIn] = useState("");
  const [hostIsPlaying, setHostIsPlaying] = useState(true);
  const [templates, setTemplates] = useState<GameTemplate[]>([]);
  const [canSaveTemplate, setCanSaveTemplate] = useState(false);
  const [saveTemplate, setSaveTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [preferredRoster, setPreferredRoster] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);
  const [creationError, setCreationError] = useState<string | null>(null);
  const [resumeGames, setResumeGames] = useState<ResumableGame[]>([]);

  useEffect(() => {
    setName((current) => current || getPlayerName() || "");
    setReady(true);
    const previousGames = getActiveGames();
    if (previousGames.length) {
      void Promise.all(previousGames.map(async (code) => {
        try {
          const game = await getGame(code);
          if (!game) return null;
          if (game.status !== "ended") {
            return { code: game.code, name: game.name, status: game.status } as ResumableGame;
          }
          if (window.sessionStorage.getItem(`returned:${code}`)) return null;
          window.sessionStorage.setItem(`returned:${code}`, "1");
          const userId = await withTimeout(getCurrentUserId(), "Could not confirm your session. Check your connection and try again.");
          const isHost = game.host_user_id
            ? game.host_user_id === userId
            : game.host_session_id === getSessionId();
          if (isHost) {
            await recordGameEvent(game.id, "host_returned_to_create");
            trackProductOpsEvent("host.returned_to_create", {}, game.id);
          }
        } catch {
          // A transient recovery lookup must not hide the other unfinished
          // tables stored on this device.
        }
        return null;
      })).then((games) => setResumeGames(games.filter((game): game is ResumableGame => game !== null)));
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
        void getProfileById(currentUser.id).then((profile) => {
          if (profile?.display_name?.trim() && !nameEdited.current) {
            setName(profile.display_name.trim());
          }
        }).catch(() => undefined);
        return getGameTemplates(currentUser.id).then(setTemplates);
      }
    }).catch(() => undefined);
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creationInFlight.current) return;

    const trimmedName = name.trim();
    const trimmedGameName = gameName.trim();
    const parsedBuyIn = Number(buyIn);

    const nextErrors: FormErrors = {};
    nextErrors.name = validatePlayerName(trimmedName) ?? undefined;
    nextErrors.gameName = validateGameName(trimmedGameName) ?? undefined;
    nextErrors.buyIn = validateCurrencyAmount(buyIn, { allowZero: false }) ?? undefined;
    setErrors(nextErrors);
    if (nextErrors.name || nextErrors.gameName || nextErrors.buyIn) {
      document.getElementById(nextErrors.name ? "create-name" : nextErrors.gameName ? "create-game-name" : "create-buy-in")?.focus();
      return;
    }

    creationInFlight.current = true;
    setCreationError(null);
    setLoading(true);
    try {
      setPlayerName(trimmedName);
      const userId = await withTimeout(getCurrentUserId(), "Could not confirm your session. Check your connection and try again.");
      const { code } = await createGame(
        trimmedGameName,
        trimmedName,
        parsedBuyIn,
        userId,
        undefined,
        { hostIsPlaying },
      );
      if (saveTemplate && canSaveTemplate && userId) {
        try {
          await withTimeout(saveGameTemplate({
            userId,
            name: templateName.trim() || trimmedGameName,
            gameName: trimmedGameName,
            buyInAmount: parsedBuyIn,
            preferredRoster: preferredRoster.split(","),
          }), "The table was created, but its recurring template could not be confirmed.");
        } catch {
          toast("Game created, but the recurring template could not be saved.", "error");
        }
      }
      setActiveGame(code);
      markPostGameEntry(code);
      window.sessionStorage.setItem("ante_post_create_source_game", code);
      toast("Game created!", "success");
      // A document navigation avoids carrying a stale Next.js client across a
      // deployment and gives the new room a clean service-worker/app shell.
      navigateToFreshAppPage(`/game/${code}`);
    } catch (err) {
      trackProductOpsEvent("game.create_failed", {
        reason: classifyProductOpsFailure(err),
        storage_mode: usingLocalStorage() ? "local_storage" : "supabase",
      });
      const failureMessage =
        err instanceof Error
          ? err.message
          : err && typeof err === "object" && "message" in err && typeof err.message === "string"
            ? err.message
            : "Something went wrong. Please try again.";
      const message = failureMessage === "Finish your active guest game before starting another."
        ? "Guest accounts can keep two unfinished tables. Resume or finish one before starting another."
        : failureMessage;
      setCreationError(message);
      toast(message, "error");
      setLoading(false);
      creationInFlight.current = false;
    }
  }

  return (
    <GameSetupShell
      eyebrow="Host a table"
      title="Start a game."
      description="Set the buy-in, then invite your table with a code."
    >
      <div className="space-y-5">
        {resumeGames.map((game) => <ResumeGameCard key={game.code} game={game} />)}
        {resumeGames.length ? (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3.5">
            <p className="text-sm font-semibold text-gray-900">Start another table</p>
            <p className="mt-1 text-sm leading-6 text-gray-600">
              Your unfinished table stays available above. Starting another game does not close or change it.
            </p>
          </div>
        ) : null}
        <p className="text-sm leading-6 text-gray-600">
          Guests can keep two unfinished tables open. Resume or finish one before starting another, or sign in for more history.
        </p>
        {creationError ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{creationError}</p> : null}
        <form aria-label="Game details" onSubmit={handleSubmit} noValidate className="space-y-5">
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
            {preferredRoster.trim() && !saveTemplate ? <aside className="rounded-lg border border-gray-200 bg-gray-50 p-3.5"><p className="text-sm font-semibold text-gray-800">Roster reminder</p><p className="mt-1 text-sm text-gray-600">{preferredRoster}</p><p className="mt-1 text-xs text-gray-500">For your setup only. These names do not create seats; invite or add each player at the table.</p></aside> : null}
            <Input
              disabled={!ready}
              id="create-name"
              label="Your name"
              value={name}
              onChange={(event) => { nameEdited.current = true; setName(event.target.value); }}
              placeholder="Mike"
              autoComplete="name"
              maxLength={PLAYER_NAME_MAX_LENGTH}
              error={errors.name}
            />
            <Input
              disabled={!ready}
              id="create-game-name"
              label="Game name"
              value={gameName}
              onChange={(event) => setGameName(event.target.value)}
              placeholder="Friday Night at Mike's"
              maxLength={GAME_NAME_MAX_LENGTH}
              error={errors.gameName}
            />
            <Input
              disabled={!ready}
              id="create-buy-in"
              label="Buy-in amount"
              type="text"
              min={1}
              step={0.01}
              inputMode="decimal"
              pattern="[0-9]*[.]?[0-9]*"
              prefix="$"
              value={buyIn}
              onChange={(event) => setBuyIn(event.target.value)}
              placeholder="20"
              error={errors.buyIn}
            />
            <p className="text-xs leading-5 text-gray-600">This game settles wins and losses at the end. If buy-ins have already been paid into a cash pot, its payouts are different from these net payments.</p>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3.5">
              <label className="flex cursor-pointer items-start gap-2.5 text-sm font-medium text-gray-800">
                <input
                  type="checkbox"
                  checked={hostIsPlaying}
                  onChange={(event) => setHostIsPlaying(event.target.checked)}
                  aria-describedby="host-playing-help"
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-gray-950 focus:ring-gray-950"
                />
                Add my opening buy-in
              </label>
              <p id="host-playing-help" className="mt-2 text-sm leading-6 text-gray-600">
                {hostIsPlaying
                  ? `Your opening buy-in${buyIn && Number(buyIn) > 0 ? ` of $${Number(buyIn).toFixed(2)}` : ""} will be recorded when you create the game.`
                  : "Leave this off if you’re just hosting. You can buy in later."}
              </p>
            </div>
            {canSaveTemplate ? <div className="rounded-lg border border-gray-200 bg-gray-50 p-3.5">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-gray-800">
                <input type="checkbox" checked={saveTemplate} onChange={(event) => setSaveTemplate(event.target.checked)} className="h-4 w-4 rounded border-gray-300 accent-gray-950 focus:ring-gray-950" />
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
            <Button type="submit" fullWidth loading={loading} disabled={!ready}>
              {resumeGames.length ? "Start another game" : "Create game"}
            </Button>
        </form>
        {canSaveTemplate ? <TemplateManager templates={templates} onChanged={setTemplates} /> : null}
      </div>
    </GameSetupShell>
  );
}
