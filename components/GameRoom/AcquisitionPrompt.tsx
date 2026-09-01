"use client";

import { useEffect, useState } from "react";
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
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState<AcquisitionSource | null>(null);

  useEffect(() => {
    const nextVisible =
      game.acquisition_source == null &&
      window.sessionStorage.getItem(POST_CREATE_SOURCE_KEY) === game.code;
    setVisible(nextVisible);
    setExpanded(false);
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
      className="mt-4 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2
            id="acquisition-heading"
            className="text-sm font-medium text-gray-950"
          >
            A quick optional question
          </h2>
          <p className="mt-0.5 text-sm text-gray-600">
            How did you hear about Mainpot?
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setExpanded((current) => !current)}
          aria-expanded={expanded}
          aria-controls="acquisition-options"
        >
          {expanded ? "Hide" : "Answer"}
        </Button>
      </div>
      {expanded ? (
        <div
          id="acquisition-options"
          className="mt-3 flex flex-wrap gap-2 border-t border-gray-100 pt-3"
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
          <Button
            size="sm"
            variant="ghost"
            disabled={saving !== null}
            onClick={dismiss}
          >
            Not now
          </Button>
        </div>
      ) : null}
    </section>
  );
}
