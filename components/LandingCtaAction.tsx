"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const linkClasses =
  "inline-flex h-12 items-center justify-center rounded-lg px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:ring-offset-2 sm:px-6";

export default function LandingCtaAction() {
  const [hasEnteredView, setHasEnteredView] = useState(false);
  const actionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const action = actionRef.current;
    if (!action) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setHasEnteredView(true);
        observer.disconnect();
      },
      { threshold: 0.45 },
    );

    observer.observe(action);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={actionRef} className={`ante-cta-action space-y-4${hasEnteredView ? " is-visible" : ""}`}>
      <div className="ante-cta-ledger">
        <div className="flex items-center justify-between border-b border-white/10 pb-3 text-xs text-gray-400"><span>Example settlement</span><span className="text-emerald-300">Balanced</span></div>
        <div className="ante-cta-ledger-rows mt-3 space-y-2 text-sm">
          <div className="ante-cta-ledger-row flex items-center justify-between"><span>Alex <span className="mx-1 text-gray-500">→</span> Morgan</span><span className="font-semibold text-emerald-300">$40</span></div>
          <div className="ante-cta-ledger-row flex items-center justify-between"><span>Jordan <span className="mx-1 text-gray-500">→</span> Sam</span><span className="font-semibold text-emerald-300">$40</span></div>
        </div>
      </div>
      <Link href="/create" className={`${linkClasses} ante-cta-button w-full bg-white text-gray-950 hover:bg-gray-100`}>
        Start a cash game <span aria-hidden="true" className="ante-cta-button-arrow">→</span>
      </Link>
    </div>
  );
}
