"use client";

import { useState } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import Button from "@/components/ui/Button";
import type { ButtonSize, ButtonVariant } from "@/components/ui/Button";

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
  /** Uses a tighter two-button layout for constrained mobile toolbars. */
  compact?: boolean;
  children: ReactNode;
}

/**
 * Two-step inline confirmation for destructive actions. The confirmation stays
 * visible until the user explicitly confirms or cancels, which keeps the
 * consequence readable on touch devices and for assistive-technology users.
 */
export default function ConfirmButton({
  onConfirm,
  confirmLabel = "Confirm?",
  cancelLabel = "Cancel",
  variant = "danger",
  size = "md",
  loading = false,
  compact = false,
  children,
  className,
  ...rest
}: ConfirmButtonProps) {
  const [confirming, setConfirming] = useState(false);

  function startConfirm() {
    setConfirming(true);
  }

  function cancel() {
    setConfirming(false);
  }

  function handleConfirm() {
    cancel();
    onConfirm();
  }

  if (confirming) {
    return (
      <span className={["flex w-full min-w-0 items-center gap-1.5 sm:inline-flex sm:w-auto", compact ? "text-sm" : ""].join(" ")}>
        <Button
          variant={variant}
          size={size}
          className={["min-w-0 flex-1 sm:flex-none", compact ? "whitespace-normal leading-tight" : "", className ?? ""].join(" ")}
          onClick={handleConfirm}
          {...rest}
        >
          {confirmLabel}
        </Button>
        <Button variant="ghost" size={size} className="min-w-0 flex-1 sm:flex-none" onClick={cancel}>
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
      className={className}
      {...rest}
    >
      {children}
    </Button>
  );
}
