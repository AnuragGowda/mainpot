"use client";

import { useEffect, useRef, useState } from "react";
import { Share2, X } from "lucide-react";
import SuitIcon from "@/components/SuitIcon";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import {
  defaultRecapPrivacy,
  deriveRecapData,
  type RecapPrivacy,
} from "@/lib/recap";
import type { PlayerNet, Transfer } from "@/lib/settlement";
import type { GameSnapshot } from "@/lib/types";
import RecapStoryCard from "./RecapStoryCard";

interface GameRecapDialogProps {
  snapshot: GameSnapshot;
  nets: PlayerNet[];
  transfers: Transfer[];
  featuredPlayerId?: string;
  onClose: () => void;
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
  featuredPlayerId,
  onClose,
}: GameRecapDialogProps) {
  const { toast } = useToast();
  const svgRef = useRef<SVGSVGElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const data = deriveRecapData(snapshot, nets, transfers);
  const [privacy, setPrivacy] = useState<RecapPrivacy>(defaultRecapPrivacy);
  const [exporting, setExporting] = useState(false);
  const featuredPlayer = data.players.find((player) => player.id === featuredPlayerId)
    ?? data.players[0]
    ?? null;

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

  const setBoolean = (key: "showPlayerNames", value: boolean) => {
    setPrivacy((current) => ({
      ...current,
      [key]: value,
    }));
  };

  function setAmountsAndLosses(value: boolean) {
    setPrivacy((current) => ({
      ...current,
      showDollarAmounts: value,
      showLosses: value,
    }));
  }

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
        className="mx-auto flex h-[100dvh] w-full max-w-6xl flex-col overflow-hidden bg-[#f2f2ea] shadow-2xl focus:outline-none sm:h-[calc(100dvh-2rem)] sm:rounded-2xl"
      >
        <header className="flex shrink-0 items-start justify-between border-b border-[#d9dcd5] bg-[#fffdf7] px-4 py-3.5 sm:px-7 sm:py-5">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 hidden h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#111512] text-white sm:grid">
              <SuitIcon suit="spade" className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#6674c6] sm:text-xs">Table receipt · Mainpot.app</p>
              <h2 id="game-recap-title" className="mt-0.5 text-xl font-semibold tracking-[-0.03em] text-gray-950 sm:text-2xl">Your game card</h2>
              <p id="game-recap-description" className="mt-1 hidden max-w-2xl text-sm leading-6 text-gray-600 sm:block">Adjust what is visible, then share your card.</p>
            </div>
          </div>
          <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="Close game recap" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-gray-500 transition hover:bg-gray-100 hover:text-gray-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950">
            <X aria-hidden size={20} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:overflow-hidden">
          <div className="relative min-h-0 min-w-0 overflow-hidden px-4 py-4 sm:px-6 sm:py-5 lg:overflow-y-auto lg:p-7">
            <div aria-hidden className="absolute -left-24 top-10 h-64 w-64 rounded-full bg-[#dfe3fb]/80 blur-3xl" />
            <div aria-hidden className="absolute -right-24 bottom-20 h-72 w-72 rounded-full bg-[#b8ddcd]/65 blur-3xl" />
            <div className="mx-auto w-full max-w-[560px]">
              <div className="relative mx-auto w-[min(76vw,300px)] rounded-[24px] border border-[#cfd3e6] bg-[#e5e7f6] p-2.5 shadow-sm sm:w-[340px] sm:p-3 lg:w-[min(34vw,400px)]">
              <RecapStoryCard
                ref={svgRef}
                data={data}
                privacy={privacy}
                mode="summary"
                featuredPlayerId={featuredPlayer?.id}
                decorative
              />
                <p className="pb-0.5 pt-2 text-center text-[11px] font-medium text-gray-500">1080 × 1920 · Story ready</p>
            </div>
            </div>
          </div>

          <aside className="min-w-0 space-y-6 border-t border-[#d9dcd5] bg-[#fffdf7] p-5 lg:overflow-y-auto lg:border-l lg:border-t-0 lg:p-6">
            <fieldset>
              <legend className="text-sm font-semibold text-gray-900">What can people see?</legend>
              <p className="mt-1 text-sm leading-5 text-gray-500">Amounts are visible by default. Choices only affect the image.</p>
              <div className="mt-3 space-y-3">
                <label className="flex cursor-pointer items-center justify-between gap-4 text-sm text-gray-700">
                  Show player names
                  <input aria-label="Show player names" type="checkbox" checked={privacy.showPlayerNames} onChange={(event) => setBoolean("showPlayerNames", event.target.checked)} className="h-4 w-4 rounded border-gray-300 text-gray-950 focus:ring-gray-950" />
                </label>
                <label className="flex cursor-pointer items-center justify-between gap-4 text-sm text-gray-700">
                  Show amounts &amp; losses
                  <input aria-label="Show amounts and losses" type="checkbox" checked={privacy.showDollarAmounts && privacy.showLosses} onChange={(event) => setAmountsAndLosses(event.target.checked)} className="h-4 w-4 rounded border-gray-300 text-gray-950 focus:ring-gray-950" />
                </label>
              </div>
            </fieldset>

            <div className="hidden border-t border-gray-200 pt-5 lg:block">
              <Button fullWidth size="lg" loading={exporting} onClick={handleShare} leftIcon={<Share2 aria-hidden size={17} />}>Share your story</Button>
            </div>
          </aside>
        </div>

        <div className="shrink-0 border-t border-gray-200 bg-white/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden">
          <div className="mx-auto max-w-lg">
            <Button fullWidth size="lg" loading={exporting} onClick={handleShare} leftIcon={<Share2 aria-hidden size={17} />}>
              Share game card
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
