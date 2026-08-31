"use client";

import { useRef, useState } from "react";
import { Copy, Download, Share2, X } from "lucide-react";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { copyText } from "@/lib/clipboard";
import {
  defaultRecapPrivacy,
  deriveRecapData,
  type RecapMode,
  type RecapPrivacy,
} from "@/lib/recap";
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
  const [mode, setMode] = useState<RecapMode>("summary");
  const [privacy, setPrivacy] = useState<RecapPrivacy>(defaultRecapPrivacy);
  const [exporting, setExporting] = useState(false);
  const data = deriveRecapData(snapshot, nets, transfers);

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
    <div className="fixed inset-0 z-50 overflow-y-auto bg-gray-950/55 p-0 backdrop-blur-sm sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="game-recap-title"
        className="mx-auto min-h-full w-full max-w-5xl bg-white shadow-2xl sm:min-h-0 sm:rounded-2xl"
      >
        <div className="flex items-start justify-between border-b border-gray-200 px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">Finished game</p>
            <h2 id="game-recap-title" className="mt-1 text-xl font-semibold tracking-tight text-gray-950">Share game recap</h2>
            <p className="mt-1 text-sm text-gray-500">A 1080 × 1920 story image. Financial details stay hidden until you choose otherwise.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close game recap" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950">
            <X aria-hidden size={20} />
          </button>
        </div>

        <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="mx-auto w-full max-w-[430px] self-start">
            <RecapStoryCard ref={svgRef} data={data} privacy={privacy} mode={mode} />
          </div>

          <div className="space-y-6">
            <fieldset>
              <legend className="text-sm font-semibold text-gray-900">Card content</legend>
              <div className="mt-2 grid grid-cols-3 rounded-lg border border-gray-200 bg-gray-50 p-1">
                {(["summary", "leaderboard", "full"] as const).map((option) => (
                  <button key={option} type="button" onClick={() => setMode(option)} className={`min-h-10 rounded-md px-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 ${mode === option ? "bg-white text-gray-950 shadow-sm" : "text-gray-500 hover:text-gray-900"}`}>
                    {option === "summary" ? "Summary" : option === "leaderboard" ? "Leaderboard" : "Full stats"}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="border-t border-gray-200 pt-5">
              <legend className="text-sm font-semibold text-gray-900">Privacy</legend>
              <p className="mt-1 text-sm leading-5 text-gray-500">These settings only change this card, never the game record.</p>
              <div className="mt-3 space-y-3">
                <label className="flex cursor-pointer items-center justify-between gap-4 text-sm text-gray-700">
                  Show player names
                  <input type="checkbox" checked={privacy.showPlayerNames} onChange={(event) => setBoolean("showPlayerNames", event.target.checked)} className="h-4 w-4 rounded border-gray-300 text-gray-950 focus:ring-gray-950" />
                </label>
                <label className="flex cursor-pointer items-center justify-between gap-4 text-sm text-gray-700">
                  Show dollar amounts
                  <input type="checkbox" checked={privacy.showDollarAmounts} onChange={(event) => setBoolean("showDollarAmounts", event.target.checked)} className="h-4 w-4 rounded border-gray-300 text-gray-950 focus:ring-gray-950" />
                </label>
                <label className={`flex items-center justify-between gap-4 text-sm ${privacy.showDollarAmounts ? "cursor-pointer text-gray-700" : "cursor-not-allowed text-gray-400"}`}>
                  Show losses
                  <input type="checkbox" disabled={!privacy.showDollarAmounts} checked={privacy.showLosses} onChange={(event) => setBoolean("showLosses", event.target.checked)} className="h-4 w-4 rounded border-gray-300 text-gray-950 focus:ring-gray-950" />
                </label>
              </div>
            </fieldset>

            {data.players.length > 0 ? (
              <fieldset className="border-t border-gray-200 pt-5">
                <legend className="text-sm font-semibold text-gray-900">Hide players</legend>
                <div className="mt-3 max-h-40 space-y-2 overflow-y-auto pr-1">
                  {data.players.map((player) => {
                    const hidden = privacy.hiddenPlayerIds.includes(player.id);
                    return (
                      <label key={player.id} className="flex cursor-pointer items-center justify-between gap-4 text-sm text-gray-700">
                        <span className="truncate">{player.displayName}</span>
                        <input type="checkbox" checked={!hidden} onChange={(event) => setPrivacy((current) => ({ ...current, hiddenPlayerIds: updateHiddenPlayer(current.hiddenPlayerIds, player.id, !event.target.checked) }))} className="h-4 w-4 shrink-0 rounded border-gray-300 text-gray-950 focus:ring-gray-950" />
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ) : null}

            <div className="space-y-2 border-t border-gray-200 pt-5">
              <Button fullWidth size="md" loading={exporting} onClick={handleShare} leftIcon={<Share2 aria-hidden size={16} />}>Share image</Button>
              <Button fullWidth variant="secondary" size="md" disabled={exporting} onClick={handleDownload} leftIcon={<Download aria-hidden size={16} />}>Download image</Button>
              <Button fullWidth variant="ghost" size="md" disabled={exporting} onClick={handleCopyLink} leftIcon={<Copy aria-hidden size={16} />}>Copy Mainpot link</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
