import type { FormFieldProps } from "@contracts";
import { cn } from "@core/ui";
import { useSkin } from "../../_skins/context";

export const fieldTypes = ["checkbox", "toggle"] as const;

export default function BooleanField({ field, value, onChange, error, disabled }: FormFieldProps) {
  const s = useSkin();
  const id = `field-${field.key}`;
  const on = Boolean(value);
  return (
    <div className="space-y-1.5">
      {field.type === "toggle" ? (
        <div className="flex min-h-control items-center justify-between gap-3">
          <label htmlFor={id} className="text-sm font-medium text-fg">
            {field.label}
          </label>
          <button
            id={id}
            type="button"
            role="switch"
            aria-checked={on}
            disabled={disabled}
            onClick={() => onChange(!on)}
            className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", on ? "bg-primary" : "bg-border", s.level !== "basic" && on && "shadow-sm shadow-primary/40")}
          >
            <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", on ? "left-[22px]" : "left-0.5")} />
          </button>
        </div>
      ) : (
        <label htmlFor={id} className="flex min-h-control items-center gap-2 text-sm font-medium text-fg">
          <input id={id} type="checkbox" disabled={disabled} checked={on} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-[var(--sparc-primary)]" />
          {field.label}
        </label>
      )}
      {error ? <p className="text-xs text-danger">{error}</p> : field.helpText ? <p className="text-xs text-muted">{field.helpText}</p> : null}
    </div>
  );
}
