// Fallback for file / image fields when the file-upload room is switched off:
// the user pastes a link instead of uploading.
import type { FormFieldProps } from "@contracts";
import { cn } from "@core/ui";
import { useSkin } from "../../_skins/context";
import { FieldShell } from "../../_shared/basic";

export const fieldTypes = ["file", "image", "avatar"] as const;

export default function FileUrl({ field, value, onChange, error, disabled }: FormFieldProps) {
  const s = useSkin();
  const id = `field-${field.key}`;
  const url = typeof value === "string" ? value : "";
  return (
    <FieldShell id={id} label={field.label} required={field.required} helpText={field.helpText ?? "Paste a link to the file"} error={error}>
      <div className="flex items-center gap-3">
        {url && field.type !== "file" && <img src={url} alt="" className="h-10 w-10 rounded-sparc object-cover" />}
        <input
          id={id}
          name={field.key}
          type="url"
          placeholder={field.placeholder || "https://…"}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          className={cn(s.input, error && "border-danger")}
          value={url}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </FieldShell>
  );
}
