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

export default function AcquisitionPrompt({ game }: { game: Game }) {
  const { toast } = useToast();
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState<AcquisitionSource | null>(null);

  useEffect(() => {
    setVisible(
      game.acquisition_source == null
      && window.sessionStorage.getItem(POST_CREATE_SOURCE_KEY) === game.code
    );
  }, [game.acquisition_source, game.code]);

  function dismiss() {
    window.sessionStorage.removeItem(POST_CREATE_SOURCE_KEY);
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <section aria-labelledby="acquisition-heading" className="mt-5 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="acquisition-heading" className="text-sm font-semibold text-gray-950">One optional question</h2>
          <p className="mt-1 text-sm text-gray-600">How did you hear about Mainpot?</p>
        </div>
        <div className="flex flex-wrap gap-2">
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
                  toast(error instanceof Error ? error.message : "Could not save that answer.", "error");
                } finally {
                  setSaving(null);
                }
              }}
            >
              {option.label}
            </Button>
          ))}
          <Button size="sm" variant="ghost" disabled={saving !== null} onClick={dismiss}>Not now</Button>
        </div>
      </div>
    </section>
  );
}
