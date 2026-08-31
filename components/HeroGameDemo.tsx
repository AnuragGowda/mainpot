"use client";

import { ArrowRight, Copy, QrCode } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import SuitIcon from "@/components/SuitIcon";

type DemoState = "live" | "settling" | "balancing" | "settled";

const players = [
  ["AP", "Alex", "$80"],
  ["MK", "Morgan", "$120"],
  ["SR", "Sam", "$80"],
  ["JT", "Jordan", "$80"],
] as const;

export default function HeroGameDemo() {
  const [demoState, setDemoState] = useState<DemoState>("live");
  const [paused, setPaused] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const elapsedRef = useRef(0);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => {
      setPrefersReducedMotion(mediaQuery.matches);
      if (mediaQuery.matches) {
        elapsedRef.current = 0;
        setDemoState("live");
      }
    };

    updatePreference();
    mediaQuery.addEventListener("change", updatePreference);
    return () => mediaQuery.removeEventListener("change", updatePreference);
  }, []);

  useEffect(() => {
    if (paused || prefersReducedMotion) return;

    const cycleLength = 10400;
    const cycleStartedAt = performance.now() - elapsedRef.current;
    let timer: number | undefined;

    const syncState = () => {
      const elapsed = (performance.now() - cycleStartedAt) % cycleLength;
      elapsedRef.current = elapsed;
      setDemoState(elapsed < 3600 ? "live" : elapsed < 5900 ? "settling" : elapsed < 7100 ? "balancing" : "settled");

      const nextChange = [3600, 5900, 7100, cycleLength].find((point) => point > elapsed) ?? cycleLength;
      timer = window.setTimeout(syncState, nextChange - elapsed + 10);
    };

    syncState();
    return () => {
      if (timer) window.clearTimeout(timer);
      elapsedRef.current = (performance.now() - cycleStartedAt) % cycleLength;
    };
  }, [paused, prefersReducedMotion]);

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse" || !cardRef.current) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;
    cardRef.current.style.setProperty("--ante-tilt-x", `${x * 4}deg`);
    cardRef.current.style.setProperty("--ante-tilt-y", `${y * -4}deg`);
  }

  function resetTilt() {
    cardRef.current?.style.setProperty("--ante-tilt-x", "0deg");
    cardRef.current?.style.setProperty("--ante-tilt-y", "0deg");
  }

  const isSettled = demoState === "settled";
  const isSettling = demoState === "settling" || demoState === "balancing";

  return (
    <div className={`relative mx-auto w-[calc(100%_-_1rem)] max-w-lg sm:w-full ${paused ? "ante-demo-paused" : ""}`} onPointerMove={handlePointerMove} onPointerEnter={() => setPaused(true)} onPointerLeave={() => { resetTilt(); setPaused(false); }}>
      <div aria-hidden="true" className="ante-card-halo absolute -inset-8 rounded-[3rem]" />
      <div aria-hidden="true" className="ante-suit-card ante-suit-card-one"><span className="ante-suit-card-surface"><SuitIcon suit="spade" /></span></div>
      <div aria-hidden="true" className="ante-suit-card ante-suit-card-two"><span className="ante-suit-card-surface"><SuitIcon suit="club" /></span></div>
      <div ref={cardRef} className="ante-demo-card relative z-[2] rounded-3xl border border-white/10 bg-[#0b0c0e] p-5 text-white shadow-2xl shadow-gray-950/25 sm:p-7">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-gray-400">Friday night</p>
            <h2 className="mt-1 text-xl font-semibold">The Basement Game</h2>
          </div>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${isSettled ? "bg-emerald-400/15 text-emerald-200" : isSettling ? "bg-amber-400/15 text-amber-100" : "bg-white/10 text-gray-200"}`}>
            <span className={`ante-live-dot h-1.5 w-1.5 rounded-full ${isSettled ? "bg-emerald-300" : isSettling ? "bg-amber-400" : "bg-emerald-400"}`} />
            {demoState === "live" ? "Live" : isSettling ? "Settling" : "Settled"}
          </span>
        </div>

        <div className="mt-8 grid grid-cols-3 gap-3">
          <div className="rounded-xl bg-white/10 p-3"><p className="text-[10px] uppercase tracking-wider text-gray-400">Bank</p><p className="mt-1 text-lg font-semibold">$360</p></div>
          <div className="rounded-xl bg-white/10 p-3"><p className="text-[10px] uppercase tracking-wider text-gray-400">Buy-in</p><p className="mt-1 text-lg font-semibold">$40</p></div>
          <div className="rounded-xl bg-white/10 p-3"><p className="text-[10px] uppercase tracking-wider text-gray-400">Players</p><p className="mt-1 text-lg font-semibold">4</p></div>
        </div>

        <div className="ante-demo-stage relative mt-5 overflow-hidden rounded-xl text-gray-900">
          <div aria-hidden={demoState !== "live"} className={`ante-demo-live ${demoState === "live" ? "ante-demo-visible" : ""}`}>
            {players.map(([initials, name, amount], index) => (
              <div key={name} className={`ante-demo-player-row flex flex-1 items-center gap-3 px-4 ${index ? "border-t border-gray-200/70" : ""}`}>
                <span className="grid h-8 w-8 place-items-center rounded-full bg-gray-100 text-xs font-semibold text-gray-700">{initials}</span>
                <span className="flex-1 text-sm font-medium">{name}</span>
                <span className="text-sm font-semibold tabular-nums">{amount}</span>
                <span className="w-14 text-right text-[10px] font-medium text-emerald-600">Verified</span>
              </div>
            ))}
          </div>
          <div key={demoState} aria-hidden={demoState !== "settling"} className={`ante-demo-settling ${demoState === "settling" ? "ante-demo-visible" : ""}`}>
              <div className="border-b border-gray-200 px-4 py-3">
              <div className="flex items-center justify-between"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-500">Enter cash-outs</p><span className="text-[10px] font-semibold text-gray-500">4 of 4 entered</span></div>
            </div>
            {[["AP", "Alex", "$40"], ["MK", "Morgan", "$160"], ["SR", "Sam", "$120"], ["JT", "Jordan", "$40"]].map(([initials, name, amount]) => (
              <div key={name} className="ante-demo-cashout-row flex flex-1 items-center gap-3 border-b border-gray-200/70 px-4 last:border-0">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-gray-100 text-[10px] font-semibold text-gray-700">{initials}</span>
                <span className="flex-1 text-sm font-medium">{name}</span>
                <span className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-semibold tabular-nums text-gray-800 shadow-sm">{name === "Jordan" ? <span className="ante-cashout-typing">{amount}</span> : amount}</span>
              </div>
            ))}
          </div>
          <div aria-hidden={demoState !== "balancing"} className={`ante-demo-balancing ${demoState === "balancing" ? "ante-demo-visible" : ""}`}>
            <span className="grid h-11 w-11 place-items-center rounded-full bg-emerald-100 text-lg text-emerald-700">✓</span>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">All stacks entered</p>
            <p className="mt-1 text-lg font-semibold">Bank balanced. Preparing payments.</p>
            <div className="mt-5 h-1.5 w-40 overflow-hidden rounded-full bg-gray-100"><span className="ante-balance-progress block h-full rounded-full bg-emerald-500" /></div>
          </div>
          <div aria-hidden={demoState !== "settled"} className={`ante-demo-settlement ${demoState === "settled" ? "ante-demo-visible" : ""}`}>
            <div className="ante-settlement-header">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-500">Final settlement</p>
                <p className="mt-0.5 text-sm font-semibold">Two payments. All chips accounted for.</p>
              </div>
            </div>
            <div className="flex flex-1 flex-col justify-center gap-2 p-3">
            {[["A", "Alex", "M", "Morgan", "$40"], ["J", "Jordan", "S", "Sam", "$40"]].map(([fromInitial, from, toInitial, to, amount]) => (
              <div key={from} className="ante-settlement-payment">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-gray-200 text-[10px] font-semibold text-gray-700">{fromInitial}</span>
                <span className="text-sm font-medium">{from}</span>
                <span className="grid h-5 w-5 place-items-center rounded-full bg-gray-100 text-gray-400"><ArrowRight aria-hidden="true" className="h-3 w-3" /></span>
                <span className="grid h-7 w-7 place-items-center rounded-full bg-violet-100 text-[10px] font-semibold text-violet-700">{toInitial}</span>
                <span className="flex-1 text-sm font-medium">{to}</span>
                <span className="rounded-md bg-emerald-100 px-2 py-1 text-xs font-semibold tabular-nums text-emerald-700">{amount}</span>
              </div>
            ))}
            </div>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
          <div><p className="text-xs text-gray-400">Room code</p><p className="mt-0.5 font-mono text-lg font-semibold tracking-[0.2em]">RIVER7</p></div>
          <div className="flex items-center gap-2" aria-label="Room code sharing options">
            <span aria-label="Copy room code" className="ante-demo-icon-button" role="img"><Copy aria-hidden="true" className="h-4 w-4" /></span>
            <span aria-label="Show room QR code" className="ante-demo-icon-button" role="img"><QrCode aria-hidden="true" className="h-4 w-4" /></span>
          </div>
        </div>
      </div>
    </div>
  );
}
