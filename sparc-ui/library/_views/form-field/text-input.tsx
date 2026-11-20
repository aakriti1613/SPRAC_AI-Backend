import type { FormFieldProps } from "@contracts";
import { cn } from "@core/ui";
import { useSkin } from "../../_skins/context";
import { FieldShell } from "../../_shared/basic";

export const fieldTypes = ["text", "email", "password", "phone", "url", "color"] as const;

const INPUT_TYPE: Record<string, string> = { email: "email", password: "password", phone: "tel", url: "url", color: "color" };
const AUTOCOMPLETE: Record<string, string> = { email: "email", phone: "tel", password: "new-password" };

export default function TextInput({ field, value, onChange, error, disabled }: FormFieldProps) {
  const s = useSkin();
  const id = `field-${field.key}`;
  const isColor = field.type === "color";
  return (
    <FieldShell id={id} label={field.label} required={field.required} helpText={field.helpText} error={error}>
      <input
        id={id}
        name={field.key}
        type={INPUT_TYPE[field.type] ?? "text"}
        autoComplete={AUTOCOMPLETE[field.type]}
        placeholder={field.placeholder}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn(s.input, isColor && "w-20 p-1", error && "border-danger")}
        // sparc-allow fixed-colour: <input type="color"> needs a valid hex start value; this is data, not styling
        value={isColor ? String(value || "#000000") : String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
      />
    </FieldShell>
  );
}
