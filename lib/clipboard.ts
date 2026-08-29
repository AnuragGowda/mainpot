/**
 * Copies `text` to the clipboard. Uses the async Clipboard API when the
 * page is served over a secure context (https / localhost); otherwise falls
 * back to a hidden `<textarea>` + `document.execCommand("copy")`.
 *
 * Throws if the copy fails (permission denied, unsupported, etc.).
 */
export async function copyText(text: string): Promise<void> {
  if (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    typeof navigator !== "undefined" &&
    navigator.clipboard
  ) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "0";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
  const ok = document.execCommand("copy");
  document.body.removeChild(textarea);
  if (!ok) {
    throw new Error("Copy failed");
  }
}