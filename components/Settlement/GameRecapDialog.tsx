"use client";

import { useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2, Share2, X } from "lucide-react";
import { renderRecapPng } from "@/lib/recap-image";
import { getRecapCharacter, getRecapSubject } from "@/lib/recap-characters";
import SuitIcon from "@/components/SuitIcon";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import {
  deriveRecapData,
  type RecapPrivacy,
} from "@/lib/recap";
import type { PlayerNet, Transfer } from "@/lib/settlement";
import type { GameSnapshot } from "@/lib/types";
import RecapStoryCard from "./RecapStoryCard";
import RecapReveal, { type RecapRevealHandle } from "./RecapReveal";
import { readRecapPrivacy, recapSessionKey, rememberRecapPrivacy } from "@/lib/recap-session";

interface GameRecapDialogProps {
  snapshot: GameSnapshot;
  nets: PlayerNet[];
  transfers: Transfer[];
  featuredPlayerId?: string;
  onClose: () => void;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Finished-game social recap. The link is a public landing-page URL only;
 * room codes and private ledger URLs never appear in this dialog.
 */
function GameRecapEditor({
  snapshot,
  nets,
  transfers,
  featuredPlayerId,
  onClose,
}: GameRecapDialogProps) {
  const { toast } = useToast();
  const svgRef = useRef<SVGSVGElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const data = deriveRecapData(snapshot, nets, transfers);
  const subjectId = featuredPlayerId ?? getRecapSubject(data)?.id;
  const sessionKey = recapSessionKey(data.gameId, subjectId);
  const [privacy, setPrivacy] = useState<RecapPrivacy>(() => readRecapPrivacy(sessionKey));
  const revealRef = useRef<RecapRevealHandle>(null);
  const exportLock = useRef(false);
  const [exporting, setExporting] = useState(false);
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const character = getRecapCharacter(data, privacy, subjectId);
  const caption = { title: character.title.join(" "), line: character.line };

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

  useEffect(() => {
    function handleDialogKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ) ?? []).filter(element => element.getClientRects().length > 0);
      if (!focusable.length) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!dialogRef.current?.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleDialogKeyDown);
    return () => document.removeEventListener("keydown", handleDialogKeyDown);
  }, [onClose]);

  async function createPng() {
    if (!svgRef.current) throw new Error("The recap preview is still loading.");
    return renderRecapPng(svgRef.current);
  }

  async function handleShare() {
    if (exportLock.current) return;
    exportLock.current = true;
    revealRef.current?.finish();
    setExporting(true);
    try {
      const image = await createPng();
      const file = new File([image], "mainpot-game-recap.png", { type: "image/png" });
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        try {
          await navigator.share({
            title: "Poker night recap · Mainpot",
            text: `Tonight, I was ${caption.title}. ${caption.line} Get your poker alter ego at mainpot.app.`,
            files: [file],
          });
          return;
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") return;
        }
      }
      downloadBlob(image, "mainpot-game-recap.png");
      toast("Game card downloaded.", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't share the recap.", "error");
    } finally {
      exportLock.current = false;
      setExporting(false);
    }
  }

  function updatePrivacy(next: RecapPrivacy) {
    rememberRecapPrivacy(sessionKey, next);
    setPrivacy(next);
  }

  const privacySummary = `Names hidden · ${privacy.showDollarAmounts ? "Amounts shown" : "Amounts hidden"} · ${privacy.showLosses && privacy.showDollarAmounts ? "Losses shown" : "Losses hidden"}`;

  const setBoolean = (key: "showResult" | "showPlayerCount" | "showDuration" | "showRebuys", value: boolean) => {
    updatePrivacy({ ...privacy, [key]: value });
  };

  function setAmountsAndLosses(value: boolean) {
    updatePrivacy({ ...privacy, showDollarAmounts: value, showLosses: value });
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-gray-950/70 p-0 backdrop-blur-md sm:flex sm:items-center sm:p-4"
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
        className="mx-auto flex h-[100dvh] w-full max-w-6xl flex-col overflow-hidden bg-[#f7f8f6] shadow-2xl focus:outline-none sm:h-[min(100dvh-2rem,820px)] sm:rounded-2xl"
      >
        <header className="flex shrink-0 items-start justify-between border-b border-[#e3e7e3] bg-white px-4 py-3.5 sm:px-7 sm:py-5">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 hidden h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#111512] text-white sm:grid">
              <SuitIcon suit="spade" className="h-5 w-5" />
            </span>
            <div>
              <h2 id="game-recap-title" className="mt-0.5 text-xl font-semibold tracking-[-0.03em] text-gray-950 sm:text-2xl">Your game card</h2>
              <p id="game-recap-description" className="mt-1 text-sm text-gray-500">Meet your character. Choose the stats to share.</p>
            </div>
          </div>
          <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="Close game recap" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-gray-500 transition hover:bg-gray-100 hover:text-gray-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950">
            <X aria-hidden size={20} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:overflow-hidden">
          <div className="relative min-h-0 min-w-0 overflow-hidden px-4 py-3 sm:px-6 sm:py-5 lg:overflow-y-auto lg:p-7">
            <div aria-hidden className="absolute -left-24 top-10 h-64 w-64 rounded-full bg-[#dfe3fb]/80 blur-3xl" />
            <div aria-hidden className="absolute -right-24 bottom-20 h-72 w-72 rounded-full bg-[#e4dfff]/65 blur-3xl" />
            <div className="mx-auto w-full max-w-[560px]">
              <div className={`relative mx-auto rounded-2xl border border-[#e3e7e3] bg-white/70 p-1.5 shadow-sm lg:w-[min(30vw,340px)] lg:rounded-[24px] lg:p-3 ${previewExpanded ? "w-[min(76vw,300px)]" : "w-[min(38vw,148px)]"}`}>
              <RecapReveal ref={revealRef} sessionKey={sessionKey} description={`${caption.title}. ${caption.line}`}>
              <RecapStoryCard
                ref={svgRef}
                data={data}
                privacy={privacy}
                mode="summary"
                featuredPlayerId={subjectId}
                decorative
              />
              </RecapReveal>
              </div>
              <div className="relative mx-auto mt-3 flex max-w-sm justify-center gap-2">
                <button type="button" onClick={() => setPreviewExpanded((value) => !value)} aria-expanded={previewExpanded} className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-800 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 lg:hidden">
                  {previewExpanded ? <Minimize2 aria-hidden size={15} /> : <Maximize2 aria-hidden size={15} />}
                  {previewExpanded ? "Shrink" : "Enlarge"} preview
                </button>
              </div>
            </div>
          </div>

          <aside className="min-w-0 space-y-5 border-t border-[#e3e7e3] bg-white p-4 lg:overflow-y-auto lg:border-l lg:border-t-0 lg:p-6">
            <fieldset disabled={exporting}>
              <legend className="text-sm font-semibold text-gray-900">What can people see?</legend>
              <p className="mt-1 text-sm leading-5 text-gray-500">Table and player names always stay private.</p>
              <div className="mt-3 grid grid-cols-2 gap-x-4 lg:grid-cols-1">
                <label className="col-span-2 flex min-h-11 cursor-pointer items-center justify-between gap-3 border-b border-gray-100 text-sm text-gray-700 lg:col-span-1">
                  Dollar amounts &amp; losses
                  <input aria-label="Show amounts and losses" type="checkbox" checked={privacy.showDollarAmounts && privacy.showLosses} onChange={(event) => setAmountsAndLosses(event.target.checked)} className="h-4 w-4 shrink-0 rounded border-gray-300 accent-gray-950" />
                </label>
                {([
                  ["showResult", "Net result"],
                  ["showPlayerCount", "Player count"],
                  ["showDuration", "Game duration"],
                  ["showRebuys", "Rebuys"],
                ] as const).map(([key, label]) => (
                  <label key={key} className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-sm text-gray-700 has-[:disabled]:cursor-default has-[:disabled]:opacity-50">
                    {label}
                    <input type="checkbox" aria-label={`Show ${label.toLowerCase()}`} disabled={key === "showResult" && !privacy.showDollarAmounts} checked={key === "showResult" ? privacy.showDollarAmounts && privacy[key] !== false : privacy[key] !== false} onChange={(event) => setBoolean(key, event.target.checked)} className="h-4 w-4 shrink-0 rounded border-gray-300 accent-gray-950 focus:ring-gray-950" />
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="hidden border-t border-gray-200 pt-5 lg:block">
              <p aria-live="polite" className="mb-3 text-xs leading-5 text-gray-600">{privacySummary}</p>
              <Button fullWidth size="lg" loading={exporting} onClick={handleShare} leftIcon={<Share2 aria-hidden size={17} />}>Share game card</Button>
            </div>
          </aside>
        </div>

        <div className="shrink-0 border-t border-gray-200 bg-white/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden">
          <div className="mx-auto max-w-lg">
            <p aria-live="polite" className="mb-2 text-center text-xs leading-5 text-gray-600">{privacySummary}</p>
            <Button fullWidth size="lg" loading={exporting} onClick={handleShare} leftIcon={<Share2 aria-hidden size={17} />}>
              Share game card
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Reset editor preferences when the game or requested player changes. */
export default function GameRecapDialog(props: GameRecapDialogProps) {
  return <GameRecapEditor key={recapSessionKey(props.snapshot.game.id, props.featuredPlayerId)} {...props} />;
}
