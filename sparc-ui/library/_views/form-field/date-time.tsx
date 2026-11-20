import type { FormFieldProps } from "@contracts";
import { cn } from "@core/ui";
import { useSkin } from "../../_skins/context";
import { FieldShell } from "../../_shared/basic";

export const fieldTypes = ["date", "time", "datetime"] as const;

/** Stored value -> what the <input> expects. */
function toInput(type: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  const s = String(value);
  if (type === "date") return s.slice(0, 10);
  if (type === "time") return s.slice(0, 5);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export default function DateTime({ field, value, onChange, error, disabled }: FormFieldProps) {
  const s = useSkin();
  const id = `field-${field.key}`;
  const type = field.type === "datetime" ? "datetime-local" : field.type;
  return (
    <FieldShell id={id} label={field.label} required={field.required} helpText={field.helpText} error={error}>
      <input
        id={id}
        name={field.key}
        type={type}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn(s.input, error && "border-danger")}
        value={toInput(field.type, value)}
        onChange={(e) => {
          const v = e.target.value;
          onChange(field.type === "datetime" && v ? new Date(v).toISOString() : v);
        }}
      />
    </FieldShell>
  );
}
