"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { createPortal } from "react-dom";
import Button from "@/components/ui/Button";
import type { ButtonSize, ButtonVariant } from "@/components/ui/Button";
import styles from "./ConfirmButton.module.css";

export interface ConfirmButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> {
  /** Called after the user confirms the action in the dialog. */
  onConfirm: () => void;
  /** Dialog heading that names the decision. */
  confirmationTitle: string;
  /** Short explanation of what will happen after confirmation. */
  confirmationDescription: ReactNode;
  /** Final action label in the dialog. */
  confirmLabel?: string;
  /** Prevent confirmation while required choices inside the dialog are incomplete. */
  confirmDisabled?: boolean;
  /** Text for the dismissive action. */
  cancelLabel?: string;
  variant?: ButtonVariant;
  /** Visual treatment for the final action inside the dialog. */
  confirmVariant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  children: ReactNode;
}

/**
 * Keeps the trigger stable in its original layout, then asks for confirmation
 * in a bottom sheet on small screens and a centered alert dialog on larger ones.
 */
export default function ConfirmButton({
  onConfirm,
  confirmationTitle,
  confirmationDescription,
  confirmLabel = "Confirm",
  confirmDisabled = false,
  cancelLabel = "Cancel",
  variant = "danger",
  confirmVariant = "danger",
  size = "md",
  loading = false,
  children,
  className,
  ...rest
}: ConfirmButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const dialogId = useId();

  useEffect(() => {
    if (!confirming) return;

    const previousOverflow = document.body.style.overflow;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const triggerElement = triggerRef.current;
    const focusFrame = window.requestAnimationFrame(() =>
      cancelButtonRef.current?.focus(),
    );

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !loading) {
        event.preventDefault();
        setConfirming(false);
        return;
      }

      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      window.requestAnimationFrame(() => {
        if (triggerElement?.isConnected) {
          triggerElement.focus();
        } else if (previouslyFocused?.isConnected) {
          previouslyFocused.focus();
        }
      });
    };
  }, [confirming, loading]);

  function cancel() {
    if (!loading) setConfirming(false);
  }

  function handleConfirm() {
    if (loading || confirmDisabled) return;
    setConfirming(false);
    onConfirm();
  }

  const dialog = confirming
    ? createPortal(
        <div
          role="presentation"
          className={`${styles.overlay} fixed inset-0 z-[70] flex items-end justify-center bg-gray-950/45 backdrop-blur-sm sm:items-center sm:p-4`}
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) cancel();
          }}
        >
          <div
            ref={dialogRef}
            id={dialogId}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            className={`${styles.panel} w-full rounded-t-2xl border border-gray-200 bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl focus:outline-none sm:max-w-sm sm:rounded-2xl sm:p-6`}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
              Confirm action
            </p>
            <h2
              id={titleId}
              className="mt-1 text-xl font-semibold tracking-tight text-gray-950"
            >
              {confirmationTitle}
            </h2>
            <div
              id={descriptionId}
              className="mt-2 text-sm leading-6 text-gray-600"
            >
              {confirmationDescription}
            </div>
            <div className="mt-6 grid gap-2 sm:grid-cols-2">
              <Button
                fullWidth
                variant={confirmVariant}
                size="md"
                disabled={loading || confirmDisabled}
                onClick={handleConfirm}
                className="sm:order-2"
              >
                {confirmLabel}
              </Button>
              <Button
                ref={cancelButtonRef}
                fullWidth
                variant="secondary"
                size="md"
                disabled={loading}
                onClick={cancel}
                className="sm:order-1"
              >
                {cancelLabel}
              </Button>
            </div>
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      <Button
        ref={triggerRef}
        variant={variant}
        size={size}
        loading={loading}
        onClick={() => setConfirming(true)}
        className={className}
        aria-haspopup="dialog"
        aria-expanded={confirming}
        aria-controls={dialogId}
        {...rest}
      >
        {children}
      </Button>
      {dialog}
    </>
  );
}
