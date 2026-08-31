"use client";

import type { ReactNode } from "react";
import PwaRegistration from "@/components/PwaRegistration";
import ProductOpsAcquisition from "@/components/ProductOpsAcquisition";
import { ToastProvider } from "@/components/ui/Toast";

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <PwaRegistration />
      <ProductOpsAcquisition />
      {children}
    </ToastProvider>
  );
}
