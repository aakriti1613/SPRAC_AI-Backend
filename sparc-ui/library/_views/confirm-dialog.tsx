import { useEffect, useRef } from "react";
import type { ConfirmDialogProps } from "@contracts";
import { cn } from "@core/ui";
import { useSkin } from "../_skins/context";

export default function ConfirmDialog({ open, title, message, confirmLabel, danger, busy, onConfirm, onCancel }: ConfirmDialogProps) {
  const s = useSkin();
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/40" onClick={onCancel} tabIndex={-1} />
      <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby={message ? "confirm-message" : undefined} className={cn(s.card, "relative w-full max-w-md p-6 shadow-xl")}>
        <h2 id="confirm-title" className="text-lg font-semibold text-fg">
          {title}
        </h2>
        {message && (
          <p id="confirm-message" className="mt-2 text-sm text-muted">
            {message}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button ref={cancelRef} type="button" className={s.button("outline")} onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className={s.button(danger ? "danger" : "primary")} onClick={onConfirm} disabled={busy}>
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
