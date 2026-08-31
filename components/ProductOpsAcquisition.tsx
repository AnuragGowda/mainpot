"use client";

import { useEffect } from "react";
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
  useEffect(() => {
    if (!productOpsEnabled() || window.localStorage.getItem(key)) return;
    window.localStorage.setItem(key, "1");
    trackProductOpsEvent("acquisition.attributed", { source: source() });
  }, []);
  return null;
}
