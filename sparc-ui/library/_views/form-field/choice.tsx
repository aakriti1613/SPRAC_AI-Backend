import type { FormFieldProps } from "@contracts";
import { cn } from "@core/ui";
import { useSkin } from "../../_skins/context";
import { FieldShell } from "../../_shared/basic";

export const fieldTypes = ["select", "radio"] as const;

export default function Choice({ field, value, onChange, error, disabled }: FormFieldProps) {
  const s = useSkin();
  const id = `field-${field.key}`;
  const options = field.options ?? [];
  if (field.type === "radio") {
    return (
      <fieldset aria-invalid={Boolean(error)} className="space-y-1.5">
        <legend className="text-sm font-medium text-fg">
          {field.label}
          {field.required && <span className="text-danger"> *</span>}
        </legend>
        <div className="flex flex-wrap gap-4 pt-1">
          {options.map((o) => (
            <label key={o} className="flex items-center gap-2 text-sm text-fg">
              <input type="radio" name={field.key} value={o} disabled={disabled} checked={value === o} onChange={() => onChange(o)} className="accent-[var(--sparc-primary)]" />
              {o}
            </label>
          ))}
        </div>
        {error ? <p className="text-xs text-danger">{error}</p> : field.helpText ? <p className="text-xs text-muted">{field.helpText}</p> : null}
      </fieldset>
    );
  }
  return (
    <FieldShell id={id} label={field.label} required={field.required} helpText={field.helpText} error={error}>
      <select
        id={id}
        name={field.key}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn(s.input, error && "border-danger")}
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{field.placeholder || "Choose…"}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}
