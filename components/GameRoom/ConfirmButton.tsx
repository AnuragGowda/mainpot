"use client";

import { useEffect, useRef, useState } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import Button from "@/components/ui/Button";
import type { ButtonSize, ButtonVariant } from "@/components/ui/Button";

const CONFIRM_TIMEOUT_MS = 3000;

export interface ConfirmButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> {
  /** Called when the user confirms the destructive action. */
  onConfirm: () => void;
  /** Text shown after the first click (defaults to "Confirm?"). */
  confirmLabel?: string;
  /** Text for the cancel button (defaults to "Cancel"). */
  cancelLabel?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  children: ReactNode;
}

/**
 * Two-step inline confirmation for destructive actions: the first click
 * switches the button into a "Confirm?" + "Cancel" pair for ~3s. Clicking
 * "Confirm?" fires `onConfirm`; clicking "Cancel" (or waiting) resets it.
 */
export default function ConfirmButton({
  onConfirm,
  confirmLabel = "Confirm?",
  cancelLabel = "Cancel",
  variant = "danger",
  size = "md",
  loading = false,
  children,
  ...rest
}: ConfirmButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  function startConfirm() {
    setConfirming(true);
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      setConfirming(false);
      timerRef.current = null;
    }, CONFIRM_TIMEOUT_MS);
  }

  function cancel() {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setConfirming(false);
  }

  function handleConfirm() {
    cancel();
    onConfirm();
  }

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <Button variant={variant} size={size} onClick={handleConfirm} {...rest}>
          {confirmLabel}
        </Button>
        <Button variant="ghost" size={size} onClick={cancel}>
          {cancelLabel}
        </Button>
      </span>
    );
  }

  return (
    <Button
      variant={variant}
      size={size}
      loading={loading}
      onClick={startConfirm}
      {...rest}
    >
      {children}
    </Button>
  );
}