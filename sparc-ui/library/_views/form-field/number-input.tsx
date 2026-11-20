import type { FormFieldProps } from "@contracts";
import { cn } from "@core/ui";
import { useSkin } from "../../_skins/context";
import { FieldShell } from "../../_shared/basic";

export const fieldTypes = ["number", "currency", "percentage", "rating"] as const;

const PREFIX: Record<string, string> = { currency: "₹" };
const SUFFIX: Record<string, string> = { percentage: "%", rating: "/ 5" };

export default function NumberInput({ field, value, onChange, error, disabled }: FormFieldProps) {
  const s = useSkin();
  const id = `field-${field.key}`;
  const prefix = PREFIX[field.type];
  const suffix = SUFFIX[field.type];
  return (
    <FieldShell id={id} label={field.label} required={field.required} helpText={field.helpText} error={error}>
      <div className="relative">
        {prefix && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">{prefix}</span>}
        <input
          id={id}
          name={field.key}
          type="number"
          inputMode="decimal"
          step={field.type === "rating" ? 1 : "any"}
          min={field.type === "rating" ? 1 : undefined}
          max={field.type === "rating" ? 5 : field.type === "percentage" ? 100 : undefined}
          placeholder={field.placeholder}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          className={cn(s.input, prefix && "pl-7", suffix && "pr-12", error && "border-danger")}
          value={value === null || value === undefined ? "" : String(value)}
          onChange={(e) => onChange(e.target.value)}
        />
        {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">{suffix}</span>}
      </div>
    </FieldShell>
  );
}
