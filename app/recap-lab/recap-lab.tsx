'use client';

import { useRef, useState } from 'react';
import CharacterStoryCard from '@/components/Settlement/exploration/CharacterStoryCard';
import RecapStoryCard from '@/components/Settlement/RecapStoryCard';
import RecapReveal, { type RecapRevealHandle } from '@/components/Settlement/RecapReveal';
import GameRecapDialog from '@/components/Settlement/GameRecapDialog';
import { editorSnapshot } from './fixtures';
import OriginalStoryCard from '@/components/Settlement/exploration/OriginalStoryCard';
import { defaultRecapPrivacy, type RecapData, type RecapPrivacy } from '@/lib/recap';
import { renderRecapPng } from '@/lib/recap-image';
import { getRecapCharacter } from '@/lib/recap-characters';
import { recapSessionKey } from '@/lib/recap-session';
import CharacterGallery from './character-gallery';

const initial = { ...defaultRecapPrivacy, showResult: true, showPlayerCount: true, showDuration: true, showRebuys: true };
const privateStats = { ...initial, showResult: false, showDollarAmounts: false, showPlayerCount: false, showDuration: false, showRebuys: false };
// Fictional ledger fixtures, not character overrides. Production has no selector.
const examples = [
  { label: 'Positive finish', id: 'example-2', net: 245, duration: 95, rebuys: 0 },
  { label: 'Negative finish', id: 'example-6', net: -120, duration: 95, rebuys: 0 },
  { label: 'Break-even', id: 'example-4', net: 0, duration: 95, rebuys: 0 },
  { label: 'Recorded rebuy', id: 'example-6', net: 40, duration: 95, rebuys: 1, privacy: { ...initial, showResult: false } },
  { label: 'Long game', id: 'example-4', net: 40, duration: 275, rebuys: 0, privacy: { ...initial, showResult: false } },
  { label: 'Private stats', id: 'example-1', net: -120, duration: 275, rebuys: 2, privacy: privateStats },
  { label: 'Private alternate game', id: 'example-0', net: 245, duration: 275, rebuys: 2, privacy: privateStats },
  { label: 'Unknown data', id: 'unknown', net: NaN, duration: undefined, rebuys: 0 },
  { label: 'Hidden player', id: 'hidden', net: -120, duration: undefined, rebuys: 2, privacy: { ...initial, hiddenPlayerIds: ['subject'] } },
  { label: 'Hidden loss', id: 'hidden-loss', net: -0.005, duration: undefined, rebuys: 0, privacy: { ...initial, showLosses: false } },
  { label: 'Cent precision', id: 'cents', net: 1.005, duration: 95, rebuys: 0 },
  { label: 'Another positive finish', id: 'example-1', net: 245, duration: 95, rebuys: 0 },
];
const controls = [
  { key: 'showResult', label: 'My result' }, { key: 'showDollarAmounts', label: 'Dollar amounts' },
  { key: 'showPlayerCount', label: 'Players' }, { key: 'showDuration', label: 'Duration' },
  { key: 'showRebuys', label: 'Rebuys' }, { key: 'showLosses', label: 'Losses' },
] as const;

export default function RecapLab() {
  const [index, setIndex] = useState(0);
  const [privacy, setPrivacy] = useState<RecapPrivacy>(initial);
  const [editorOpen, setEditorOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const ref = useRef<SVGSVGElement>(null);
  const revealRef = useRef<RecapRevealHandle>(null);
  const exportLock = useRef(false);
  const example = examples[index];
  const fixture: RecapData = {
    gameId: example.id, gameName: 'NEVER_RENDER_TABLE_NAME', playedAt: '2026-09-08', playerCount: 8,
    durationMinutes: example.duration, totalBuyIn: 800 + example.rebuys * 50, rebuyCount: example.rebuys,
    settlementPaymentCount: 7, highlights: [],
    players: [{ id: 'subject', displayName: 'NEVER_RENDER_PLAYER_NAME', net: example.net, rank: 1, rebuyCount: example.rebuys }],
  };
  const persona = getRecapCharacter(fixture, privacy, 'subject');
  const sessionKey = recapSessionKey(`lab:${example.id}`, 'subject');
  const snapshot = { ...editorSnapshot, game: { ...editorSnapshot.game, id: example.id,
    ended_at: example.duration === undefined ? null : new Date(Date.parse(editorSnapshot.game.created_at) + example.duration * 60000).toISOString(),
  }, buyIns: editorSnapshot.buyIns.filter(b => b.type !== 'rebuy').concat(editorSnapshot.buyIns.filter(b => b.type === 'rebuy').slice(0, example.rebuys)) };
  const nets = snapshot.players.map((p, i) => ({ playerId: p.id, name: p.name, net: i === 0 ? example.net : -example.net / 7 }));

  function choose(value: number) {
    setIndex(value); setPrivacy(examples[value].privacy ?? initial); setNotice('');
  }

  async function exportCard(share = false) {
    if (!ref.current || exportLock.current) return;
    exportLock.current = true;
    revealRef.current?.finish();
    setBusy(true); setNotice('');
    try {
      const blob = await renderRecapPng(ref.current);
      const file = new File([blob], 'mainpot-game-recap.png', { type: 'image/png' });
      if (share && navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        try {
          await navigator.share({ title: 'My poker night · Mainpot', text: `Tonight, I was ${persona.title.join(' ')}. ${persona.line} mainpot.app`, files: [file] });
          return;
        } catch (error) { if (error instanceof DOMException && error.name === 'AbortError') return; }
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url; link.download = file.name; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice(share ? 'Image downloaded. It’s ready for your story or group chat.' : 'Your card is ready.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Export failed. Please try again.'); }
    finally { exportLock.current = false; setBusy(false); }
  }

  return <main className="mx-auto max-w-[1160px] px-4 py-7 sm:px-8 sm:py-10">
    <header className="mb-7 border-b border-[#dedfdc] pb-7">
      <p className="text-[10px] font-semibold uppercase tracking-[.24em] text-gray-500">Mainpot / After the last hand</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-[-.055em] sm:text-5xl">The Felt Society.</h1>
      <p className="mt-3 text-sm text-gray-500">Good nights make great characters.</p>
    </header>
    <CharacterGallery/>
    <h2 className="mb-6 border-t border-[#dedfdc] pt-7 text-xl font-semibold tracking-tight">Try a game card</h2>
    <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-12">
      <section aria-label="Your game card" className="min-w-0 lg:sticky lg:top-6" data-direction="society">
        <div className="mx-auto max-w-[400px] rounded-[24px] border border-[#dedfdc] bg-white p-2 shadow-[0_12px_50px_-25px_#20242140]">
          <RecapReveal ref={revealRef} sessionKey={sessionKey} description={`${persona.title.join(' ')}. ${persona.line}`}>
            <RecapStoryCard ref={ref} data={fixture} privacy={privacy} mode="summary" featuredPlayerId="subject"/>
          </RecapReveal>
        </div>
        <div className="mx-auto mt-4 flex max-w-[400px] gap-2">
          <button onClick={() => exportCard(true)} disabled={busy} className="min-h-12 flex-1 rounded-xl bg-[#202421] px-4 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Preparing…' : 'Share card'}</button>
          <button onClick={() => exportCard()} disabled={busy} className="min-h-12 rounded-xl border border-[#d9dcd5] bg-white px-5 text-sm font-semibold disabled:opacity-50">Download PNG</button>
        </div>
        <p className="mx-auto mt-3 max-w-[400px] text-center text-[11px] text-gray-500" role="status">{notice || '2160 × 3840 · Ready for stories and group chats'}</p>
      </section>
      <section aria-label="Card options" className="min-w-0">
        <h2 className="text-lg font-semibold tracking-tight">A character, just for this night.</h2>
        <p className="mt-3 text-sm leading-6 text-gray-500">Assigned from the facts you share. The same game and player always get the same character with the same stats visible.</p>
        <fieldset disabled={busy} className="mt-7 border-t border-[#dedfdc] pt-3">
          <legend className="pr-3 text-sm font-semibold">What can people see?</legend>
          <p className="mt-1 text-xs leading-5 text-gray-500">Only share what you want. Names always stay off.</p>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1">{controls.map(control => <label key={control.key} className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-gray-600"><input type="checkbox" checked={privacy[control.key] !== false} onChange={event => { setPrivacy(current => ({ ...current, [control.key]: event.target.checked })); setNotice(''); }} className="h-4 w-4 accent-[#202421]"/>{control.label}</label>)}</div>
        </fieldset>
        <div className="mt-7 rounded-2xl border border-dashed border-[#b8bcae] bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Lab fixtures · Review only</p>
          <label className="mt-3 block text-sm text-gray-700">Example game
            <select value={index} disabled={busy} onChange={event => choose(Number(event.target.value))} className="mt-2 min-h-11 w-full rounded-xl border border-gray-300 bg-white px-3">{examples.map((item,i) => <option key={item.label} value={i}>{item.label}</option>)}</select>
          </label>
          <button disabled={busy} onClick={() => setEditorOpen(true)} className="mt-4 min-h-11 text-sm font-medium text-gray-700 underline decoration-gray-300 underline-offset-4">Preview game editor</button>
          <p className="mt-2 text-xs leading-5 text-gray-500">Fictional ledger data. Opens the actual game-end editor with this game’s facts and its own saved privacy settings. Fixture controls are absent from the product.</p>
        </div>
      </section>
    </div>
    {editorOpen && <GameRecapDialog key={example.id} snapshot={snapshot} nets={nets} transfers={[]} featuredPlayerId="subject" onClose={() => setEditorOpen(false)}/>}
    <details className="mt-12 border-t border-[#dedfdc] pt-5">
      <summary className="min-h-11 cursor-pointer text-sm font-medium text-gray-500">Earlier design references</summary>
      <p className="mt-2 text-xs text-gray-500">Historical design and copy, retained for comparison.</p>
      <div className="mt-5 grid max-w-[700px] gap-6 sm:grid-cols-2">
        <div><p className="mb-3 text-xs text-gray-500">Original card</p><OriginalStoryCard data={fixture} privacy={privacy} mode="summary"/></div>
        <div><p className="mb-3 text-xs text-gray-500">Pocket Legends</p><CharacterStoryCard data={fixture} privacy={privacy} direction="pocket"/></div>
      </div>
    </details>
  </main>;
}
