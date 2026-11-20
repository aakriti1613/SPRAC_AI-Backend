import type { FormFieldProps } from "@contracts";
import { cn } from "@core/ui";
import { useSkin } from "../../_skins/context";
import { FieldShell } from "../../_shared/basic";

export const fieldTypes = ["textarea"] as const;

export default function Textarea({ field, value, onChange, error, disabled }: FormFieldProps) {
  const s = useSkin();
  const id = `field-${field.key}`;
  return (
    <FieldShell id={id} label={field.label} required={field.required} helpText={field.helpText} error={error}>
      <textarea
        id={id}
        name={field.key}
        rows={4}
        placeholder={field.placeholder}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn(s.input, "h-auto py-2", error && "border-danger")}
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
      />
    </FieldShell>
  );
}
