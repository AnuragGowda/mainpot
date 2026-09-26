"use client";

import { useState } from "react";
import { deleteGameTemplate, updateGameTemplate, type GameTemplate } from "@/lib/account-data";
import { validateCurrencyAmount } from "@/lib/currency-input";
import { validateGameName } from "@/lib/name-validation";
import ConfirmButton from "@/components/GameRoom/ConfirmButton";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

export default function TemplateManager({ templates, onChanged }: { templates: GameTemplate[]; onChanged: (templates: GameTemplate[]) => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", gameName: "", buyIn: "", roster: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!templates.length) return null;
  return <details className="rounded-lg border border-gray-200 bg-white p-4">
    <summary className="cursor-pointer text-sm font-semibold text-gray-800">Manage saved templates</summary>
    <ul className="mt-3 space-y-3">
      {templates.map((template) => <li key={template.id} className="border-t border-gray-100 pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-medium text-gray-800">{template.name}</span><div className="flex gap-2">
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => { setEditing(template.id); setError(""); setDraft({ name: template.name, gameName: template.game_name, buyIn: String(template.buy_in_amount), roster: template.preferred_roster.join(", ") }); }}>Edit</Button>
          <ConfirmButton size="sm" variant="ghost" loading={busy} confirmationTitle={`Remove ${template.name}?`} confirmationDescription="Existing games stay saved. Only this reusable setup is removed." confirmLabel="Remove template" onConfirm={async () => {
            setBusy(true); setError("");
            try { await deleteGameTemplate(template.id); onChanged(templates.filter((item) => item.id !== template.id)); if (editing === template.id) setEditing(null); }
            catch (cause) { setError(cause instanceof Error ? cause.message : "Could not remove template."); }
            finally { setBusy(false); }
          }}>Remove</ConfirmButton>
        </div></div>
        {editing === template.id ? <form className="mt-3 space-y-3" onSubmit={async (event) => {
          event.preventDefault();
          const validation = validateGameName(draft.name) || validateGameName(draft.gameName) || validateCurrencyAmount(draft.buyIn, { allowZero: false });
          if (validation) { setError(validation); return; }
          setBusy(true); setError("");
          try { const saved = await updateGameTemplate(template.id, { name: draft.name, gameName: draft.gameName, buyInAmount: Number(draft.buyIn), preferredRoster: draft.roster.split(",") }); onChanged(templates.map((item) => item.id === saved.id ? saved : item)); setEditing(null); }
          catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save template."); }
          finally { setBusy(false); }
        }}>
          <Input label="Template name" value={draft.name} maxLength={80} disabled={busy} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
          <Input label="Saved game name" value={draft.gameName} maxLength={80} disabled={busy} onChange={(event) => setDraft({ ...draft, gameName: event.target.value })} />
          <Input label="Saved buy-in" value={draft.buyIn} inputMode="decimal" prefix="$" disabled={busy} onChange={(event) => setDraft({ ...draft, buyIn: event.target.value })} />
          <Input label="Roster reminder" value={draft.roster} disabled={busy} onChange={(event) => setDraft({ ...draft, roster: event.target.value })} />
          <div className="flex gap-2"><Button type="submit" loading={busy}>Save template</Button><Button variant="secondary" disabled={busy} onClick={() => { setEditing(null); setError(""); }}>Cancel</Button></div>
        </form> : null}
      </li>)}
    </ul>
    {error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}
  </details>;
}
