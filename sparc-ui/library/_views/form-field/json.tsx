// Structured values (address, json) edited as JSON text. Invalid JSON is kept
// as text so nothing the user typed is lost; validation reports it.
import { useState } from "react";
import type { FormFieldProps } from "@contracts";
import { cn } from "@core/ui";
import { useSkin } from "../../_skins/context";
import { FieldShell } from "../../_shared/basic";

export const fieldTypes = ["address", "json", "reference"] as const;

const toText = (v: unknown) => (v === null || v === undefined || v === "" ? "" : typeof v === "string" ? v : JSON.stringify(v, null, 2));

export default function JsonField({ field, value, onChange, error, disabled }: FormFieldProps) {
  const s = useSkin();
  const id = `field-${field.key}`;
  const [text, setText] = useState(() => toText(value));
  const [parseError, setParseError] = useState<string>();
  if (field.type === "reference") {
    return (
      <FieldShell id={id} label={field.label} required={field.required} helpText={field.helpText ?? "ID of the linked record"} error={error}>
        <input id={id} disabled={disabled} className={cn(s.input, error && "border-danger")} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />
      </FieldShell>
    );
  }
  return (
    <FieldShell
      id={id}
      label={field.label}
      required={field.required}
      helpText={field.helpText ?? (field.type === "address" ? 'e.g. {"line1": "12 MG Road", "city": "Pune"}' : "JSON object")}
      error={error ?? parseError}
    >
      <textarea
        id={id}
        rows={4}
        disabled={disabled}
        className={cn(s.input, "h-auto py-2 font-mono text-xs", (error || parseError) && "border-danger")}
        value={text}
        onChange={(e) => {
          const next = e.target.value;
          setText(next);
          if (!next.trim()) {
            setParseError(undefined);
            onChange("");
            return;
          }
          try {
            onChange(JSON.parse(next));
            setParseError(undefined);
          } catch {
            setParseError("Not valid JSON yet.");
            onChange(next);
          }
        }}
      />
    </FieldShell>
  );
}
