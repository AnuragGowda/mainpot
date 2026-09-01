"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, Download, RefreshCw, Share2, X } from "lucide-react";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { copyText } from "@/lib/clipboard";
import {
  defaultRecapPrivacy,
  deriveRecapData,
  type RecapMode,
  type RecapPrivacy,
} from "@/lib/recap";
import { getRecapPersona } from "@/lib/recap-personality";
import type { PlayerNet, Transfer } from "@/lib/settlement";
import type { GameSnapshot } from "@/lib/types";
import RecapStoryCard from "./RecapStoryCard";

interface GameRecapDialogProps {
  snapshot: GameSnapshot;
  nets: PlayerNet[];
  transfers: Transfer[];
  onClose: () => void;
}

function updateHiddenPlayer(
  hiddenPlayerIds: string[],
  playerId: string,
  hidden: boolean
): string[] {
  return hidden
    ? [...hiddenPlayerIds, playerId]
    : hiddenPlayerIds.filter((id) => id !== playerId);
}

function safeRecapLink(): string {
  return `${window.location.origin}/?ref=game-recap`;
}

function playerInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}

async function renderPng(svg: SVGSVGElement): Promise<Blob> {
  const source = new XMLSerializer().serializeToString(svg);
  const svgBlob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
  const sourceUrl = URL.createObjectURL(svgBlob);

  try {
    const image = new Image();
    image.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("The recap image could not be rendered."));
      image.src = sourceUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1920;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser cannot create an image for this recap.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("The recap image could not be exported."));
      }, "image/png");
    });
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * Finished-game social recap. The link is a public landing-page URL only;
 * room codes and private ledger URLs never appear in this dialog.
 */
export default function GameRecapDialog({
  snapshot,
  nets,
  transfers,
  onClose,
}: GameRecapDialogProps) {
  const { toast } = useToast();
  const svgRef = useRef<SVGSVGElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const data = deriveRecapData(snapshot, nets, transfers);
  const [mode, setMode] = useState<RecapMode>("summary");
  const [privacy, setPrivacy] = useState<RecapPrivacy>(defaultRecapPrivacy);
  const [featuredPlayerId, setFeaturedPlayerId] = useState(
    () => data.players[0]?.id ?? ""
  );
  const [personaIndex, setPersonaIndex] = useState(0);
  const [exporting, setExporting] = useState(false);
  const featuredPlayer = data.players.find((player) => player.id === featuredPlayerId)
    ?? data.players[0]
    ?? null;
  const persona = getRecapPersona(
    data,
    featuredPlayer?.id,
    personaIndex,
    privacy.showPlayerNames
  );

  function dealAnotherPersona() {
    setPersonaIndex((current) => current + 1);
  }

  function featurePlayer(playerId: string) {
    setFeaturedPlayerId(playerId);
    setPersonaIndex(0);
    setMode("summary");
  }

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, []);

  function handleDialogKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
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
  }

  async function createPng() {
    if (!svgRef.current) throw new Error("The recap preview is still loading.");
    return renderPng(svgRef.current);
  }

  async function handleDownload() {
    setExporting(true);
    try {
      downloadBlob(await createPng(), "mainpot-game-recap.png");
      toast("Story image downloaded", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't export the recap.", "error");
    } finally {
      setExporting(false);
    }
  }

  async function handleShare() {
    setExporting(true);
    try {
      const image = await createPng();
      const file = new File([image], "mainpot-game-recap.png", { type: "image/png" });
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        try {
          await navigator.share({
            title: `${data.gameName} recap · Mainpot`,
            text: "Poker night recap from Mainpot.",
            files: [file],
          });
          return;
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") return;
        }
      }
      downloadBlob(image, "mainpot-game-recap.png");
      toast("Your browser downloaded the image so you can share it anywhere.", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't share the recap.", "error");
    } finally {
      setExporting(false);
    }
  }

  async function handleCopyLink() {
    try {
      await copyText(safeRecapLink());
      toast("Mainpot link copied", "success");
    } catch {
      toast("Couldn't copy the Mainpot link.", "error");
    }
  }

  const setBoolean = (key: "showDollarAmounts" | "showPlayerNames" | "showLosses", value: boolean) => {
    setPrivacy((current) => ({
      ...current,
      [key]: value,
      ...(key === "showDollarAmounts" && !value ? { showLosses: false } : {}),
    }));
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-gray-950/70 p-0 backdrop-blur-md sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="game-recap-title"
        aria-describedby="game-recap-description"
        onKeyDown={handleDialogKeyDown}
        className="mx-auto flex h-[100dvh] w-full max-w-6xl flex-col overflow-hidden bg-[#f7f8f6] shadow-2xl focus:outline-none sm:h-[calc(100dvh-2rem)] sm:rounded-2xl"
      >
        <header className="flex shrink-0 items-start justify-between border-b border-gray-200 bg-white px-4 py-3.5 sm:px-7 sm:py-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700 sm:text-xs">Mainpot game card</p>
            <h2 id="game-recap-title" className="mt-0.5 text-xl font-semibold tracking-[-0.03em] text-gray-950 sm:text-2xl">Share the night</h2>
            <p id="game-recap-description" className="mt-1 hidden max-w-2xl text-sm leading-6 text-gray-600 sm:block">Choose a player, deal a nickname, then decide what belongs on the final image.</p>
          </div>
          <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="Close game recap" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-gray-500 transition hover:bg-gray-100 hover:text-gray-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950">
            <X aria-hidden size={20} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:overflow-hidden">
          <div className="min-h-0 min-w-0 px-4 py-4 sm:px-6 sm:py-5 lg:overflow-y-auto lg:p-7">
            <div className="mx-auto w-full max-w-[520px]">
              <div className="mx-auto w-[min(58vw,232px)] rounded-[24px] border border-gray-200 bg-[#ecefe9] p-2.5 shadow-sm sm:w-[280px] sm:p-3">
              {mode === "summary" ? (
                <button
                  type="button"
                  onClick={dealAnotherPersona}
                  aria-label={`Deal another nickname for ${featuredPlayer?.displayName ?? "the featured player"}`}
                  className="group relative block w-full rounded-[18px] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:ring-offset-4 focus-visible:ring-offset-[#ecefe9]"
                >
                  <RecapStoryCard
                    ref={svgRef}
                    data={data}
                    privacy={privacy}
                    mode={mode}
                    featuredPlayerId={featuredPlayer?.id}
                    persona={persona}
                    decorative
                  />
                  <span className="absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-md border border-white/15 bg-gray-950/90 px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-white shadow-lg backdrop-blur-sm transition group-hover:-translate-y-0.5">
                    <RefreshCw aria-hidden size={13} /> Tap for another
                  </span>
                </button>
              ) : (
                <RecapStoryCard ref={svgRef} data={data} privacy={privacy} mode={mode} />
              )}
                <p className="pb-0.5 pt-2 text-center text-[11px] font-medium text-gray-500">1080 × 1920 · Story ready</p>
            </div>

            {data.players.length > 0 ? (
                <fieldset className="mt-4">
                  <legend className="text-xs font-bold uppercase tracking-[0.14em] text-gray-500">Who gets the card?</legend>
                  <div className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:justify-center sm:px-0">
                  {data.players.map((player) => (
                    <button
                      key={player.id}
                      type="button"
                      aria-pressed={featuredPlayer?.id === player.id && mode === "summary"}
                      onClick={() => featurePlayer(player.id)}
                        className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 ${featuredPlayer?.id === player.id && mode === "summary" ? "border-gray-950 bg-gray-950 text-white" : "border-gray-300 bg-white text-gray-700 hover:border-gray-400"}`}
                    >
                        <span aria-hidden className={`grid h-8 w-8 place-items-center rounded-full text-xs font-bold ${featuredPlayer?.id === player.id && mode === "summary" ? "bg-[#dceabf] text-gray-950" : "bg-gray-100 text-gray-600"}`}>
                          {playerInitial(player.displayName)}
                        </span>
                        {player.displayName}
                    </button>
                  ))}
                </div>
              </fieldset>
            ) : null}

            {mode === "summary" ? (
                <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-3">
                <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Dealt nickname</p>
                  <p aria-live="polite" className="mt-0.5 truncate text-sm font-semibold text-gray-900">{persona.title}</p>
                </div>
                <Button variant="secondary" size="sm" onClick={dealAnotherPersona} leftIcon={<RefreshCw aria-hidden size={14} />}>
                    Another
                </Button>
              </div>
            ) : null}
            </div>
          </div>

          <aside className="min-w-0 space-y-6 border-t border-gray-200 bg-white p-5 lg:overflow-y-auto lg:border-l lg:border-t-0 lg:p-6">
            <fieldset>
              <legend className="text-sm font-semibold text-gray-900">Choose a layout</legend>
              <div className="mt-2 grid grid-cols-3 rounded-lg border border-gray-200 bg-gray-50 p-1">
                {(["summary", "leaderboard", "full"] as const).map((option) => (
                  <button key={option} type="button" onClick={() => setMode(option)} className={`min-h-10 rounded-md px-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 ${mode === option ? "bg-white text-gray-950 shadow-sm" : "text-gray-500 hover:text-gray-900"}`}>
                    {option === "summary" ? "Player" : option === "leaderboard" ? "Final table" : "Full stats"}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="border-t border-gray-200 pt-5">
              <legend className="text-sm font-semibold text-gray-900">What can people see?</legend>
              <p className="mt-1 text-sm leading-5 text-gray-500">Private by default. These choices only affect the image.</p>
              <div className="mt-3 space-y-3">
                <label className="flex cursor-pointer items-center justify-between gap-4 text-sm text-gray-700">
                  Show player names
                  <input aria-label="Show player names" type="checkbox" checked={privacy.showPlayerNames} onChange={(event) => setBoolean("showPlayerNames", event.target.checked)} className="h-4 w-4 rounded border-gray-300 text-gray-950 focus:ring-gray-950" />
                </label>
                <label className="flex cursor-pointer items-center justify-between gap-4 text-sm text-gray-700">
                  Show dollar amounts
                  <input aria-label="Show dollar amounts" type="checkbox" checked={privacy.showDollarAmounts} onChange={(event) => setBoolean("showDollarAmounts", event.target.checked)} className="h-4 w-4 rounded border-gray-300 text-gray-950 focus:ring-gray-950" />
                </label>
                <label className={`flex items-center justify-between gap-4 text-sm ${privacy.showDollarAmounts ? "cursor-pointer text-gray-700" : "cursor-not-allowed text-gray-400"}`}>
                  Show losses
                  <input aria-label="Show losses" type="checkbox" disabled={!privacy.showDollarAmounts} checked={privacy.showLosses} onChange={(event) => setBoolean("showLosses", event.target.checked)} className="h-4 w-4 rounded border-gray-300 text-gray-950 focus:ring-gray-950" />
                </label>
              </div>
            </fieldset>

            {data.players.length > 0 && mode !== "summary" ? (
              <fieldset className="border-t border-gray-200 pt-5">
                <legend className="text-sm font-semibold text-gray-900">Leaderboard players</legend>
                <div className="mt-3 max-h-40 space-y-2 overflow-y-auto pr-1">
                  {data.players.map((player) => {
                    const hidden = privacy.hiddenPlayerIds.includes(player.id);
                    return (
                      <label key={player.id} className="flex cursor-pointer items-center justify-between gap-4 text-sm text-gray-700">
                        <span className="truncate">{player.displayName}</span>
                        <input aria-label={`Include ${player.displayName}`} type="checkbox" checked={!hidden} onChange={(event) => setPrivacy((current) => ({ ...current, hiddenPlayerIds: updateHiddenPlayer(current.hiddenPlayerIds, player.id, !event.target.checked) }))} className="h-4 w-4 shrink-0 rounded border-gray-300 text-gray-950 focus:ring-gray-950" />
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ) : null}

            <div className="space-y-2 border-t border-gray-200 pt-5">
              <Button fullWidth size="lg" loading={exporting} onClick={handleShare} leftIcon={<Share2 aria-hidden size={17} />}>Share your story</Button>
              <Button fullWidth variant="secondary" size="md" disabled={exporting} onClick={handleDownload} leftIcon={<Download aria-hidden size={16} />}>Save image</Button>
              <Button fullWidth variant="ghost" size="md" disabled={exporting} onClick={handleCopyLink} leftIcon={<Copy aria-hidden size={16} />}>Copy Mainpot link</Button>
            </div>
          </aside>
        </div>

        <div className="shrink-0 border-t border-gray-200 bg-white/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden">
          <div className="mx-auto grid max-w-lg grid-cols-[minmax(0,1fr)_52px] gap-2">
            <Button fullWidth size="lg" loading={exporting} onClick={handleShare} leftIcon={<Share2 aria-hidden size={17} />}>
              Share game card
            </Button>
            <button
              type="button"
              disabled={exporting}
              onClick={handleDownload}
              aria-label="Save game card image"
              className="grid h-12 w-[52px] place-items-center rounded-lg border border-gray-300 bg-white text-gray-800 shadow-sm transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download aria-hidden size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
