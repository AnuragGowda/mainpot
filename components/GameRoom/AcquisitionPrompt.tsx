"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { setGameAcquisitionSource } from "@/lib/data";
import type { AcquisitionSource, Game } from "@/lib/types";

const POST_CREATE_SOURCE_KEY = "ante_post_create_source_game";

const options: Array<{ label: string; value: AcquisitionSource }> = [
  { label: "Personal invite", value: "personal_invite" },
  { label: "Poker group", value: "poker_group" },
  { label: "Search", value: "search" },
  { label: "Other", value: "other" },
];

export default function AcquisitionPrompt({
  game,
  onVisibilityChange,
}: {
  game: Game;
  onVisibilityChange?: (visible: boolean) => void;
}) {
  const { toast } = useToast();
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState<AcquisitionSource | null>(null);

  useEffect(() => {
    const nextVisible =
      game.acquisition_source == null &&
      window.sessionStorage.getItem(POST_CREATE_SOURCE_KEY) === game.code;
    setVisible(nextVisible);
    onVisibilityChange?.(nextVisible);
  }, [game.acquisition_source, game.code, onVisibilityChange]);

  function dismiss() {
    window.sessionStorage.removeItem(POST_CREATE_SOURCE_KEY);
    setVisible(false);
    onVisibilityChange?.(false);
  }

  if (!visible) return null;

  return (
    <section
      aria-labelledby="acquisition-heading"
      className="mt-4 rounded-xl border border-dashed border-gray-300 bg-gray-50/60 p-1"
    >
      <div className="flex items-start gap-2">
        <details className="min-w-0 flex-1">
          <summary className="cursor-pointer list-none px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gray-950">
            <span
              id="acquisition-heading"
              className="block text-sm font-semibold text-gray-950"
            >
              How did you hear about Mainpot?
            </span>
            <span className="mt-0.5 block text-xs text-gray-500">
              Optional · one tap
            </span>
          </summary>
          <div
            id="acquisition-options"
            className="flex flex-wrap gap-2 border-t border-dashed border-gray-300 px-4 pb-4 pt-3"
          >
            {options.map((option) => (
              <Button
                key={option.value}
                size="sm"
                variant="secondary"
                loading={saving === option.value}
                disabled={saving !== null}
                onClick={async () => {
                  setSaving(option.value);
                  try {
                    await setGameAcquisitionSource(game.id, option.value);
                    dismiss();
                    toast("Thanks — game on.", "success");
                  } catch (error) {
                    toast(
                      error instanceof Error
                        ? error.message
                        : "Could not save that answer.",
                      "error",
                    );
                  } finally {
                    setSaving(null);
                  }
                }}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </details>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss acquisition question"
          className="mr-1 mt-1 grid h-10 w-10 shrink-0 place-items-center rounded-lg text-gray-500 transition hover:bg-white hover:text-gray-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950"
        >
          <X aria-hidden size={18} />
        </button>
      </div>
    </section>
  );
}
