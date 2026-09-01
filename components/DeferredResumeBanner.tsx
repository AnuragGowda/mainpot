"use client";

import { useEffect, useState, type ComponentType } from "react";

export default function DeferredResumeBanner() {
  const [ResumeBanner, setResumeBanner] = useState<ComponentType | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void import("@/components/ResumeBanner").then(({ default: Banner }) => {
        setResumeBanner(() => Banner);
      });
    }, 1_500);

    return () => window.clearTimeout(timer);
  }, []);

  return ResumeBanner ? <ResumeBanner /> : null;
}
