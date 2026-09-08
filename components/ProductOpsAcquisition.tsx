"use client";

import { useEffect, useRef } from "react";
import { productOpsEnabled, trackProductOpsEvent } from "@/lib/product-ops";

const key = "mainpot_product_ops_acquisition_recorded";

function source(): "direct" | "github" | "documentation" | "self_hosted" | "other" {
  const explicit = new URLSearchParams(window.location.search).get("utm_source")?.toLowerCase();
  if (explicit === "github" || explicit === "documentation" || explicit === "self_hosted") return explicit;
  try {
    const host = new URL(document.referrer).hostname;
    if (host === "github.com") return "github";
    if (host.includes("mainpot")) return "documentation";
    return host ? "other" : "direct";
  } catch { return "direct"; }
}

export default function ProductOpsAcquisition() {
  const submitting = useRef(false);

  useEffect(() => {
    if (!productOpsEnabled() || submitting.current) return;
    try {
      if (window.localStorage.getItem(key)) return;
    } catch {
      // Storage may be unavailable; the relay still safely uses an ephemeral actor.
    }

    submitting.current = true;
    void trackProductOpsEvent("acquisition.referrer_attributed", { source: source() })
      .then((accepted) => {
        if (!accepted) return;
        try {
          window.localStorage.setItem(key, "1");
        } catch {
          // A later page visit may retry if persistent storage is unavailable.
        }
      })
      .finally(() => { submitting.current = false; });
  }, []);
  return null;
}
