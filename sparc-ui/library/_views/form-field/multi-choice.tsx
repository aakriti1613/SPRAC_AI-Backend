import { useState, type KeyboardEvent } from "react";
import type { FormFieldProps } from "@contracts";
import { cn } from "@core/ui";
import { useSkin } from "../../_skins/context";
import { FieldShell } from "../../_shared/basic";

export const fieldTypes = ["multi-select", "checkbox-group", "tags"] as const;

const asList = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === "string" && v ? v.split(",").map((s) => s.trim()).filter(Boolean) : []);

function Tags({ field, value, onChange, error, disabled }: FormFieldProps) {
  const s = useSkin();
  const id = `field-${field.key}`;
  const [draft, setDraft] = useState("");
  const tags = asList(value);
  const add = () => {
    const t = draft.trim();
    if (t && !tags.includes(t)) onChange([...tags, t]);
    setDraft("");
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add();
    } else if (e.key === "Backspace" && !draft && tags.length) {
      onChange(tags.slice(0, -1));
    }
  };
  return (
    <FieldShell id={id} label={field.label} required={field.required} helpText={field.helpText ?? "Press Enter to add"} error={error}>
      <div className={cn(s.input, "flex h-auto min-h-control flex-wrap items-center gap-1.5 py-1.5", error && "border-danger")}>
        {tags.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-sparc bg-primary-soft px-2 py-0.5 text-xs text-primary">
            {t}
            <button type="button" aria-label={`Remove ${t}`} disabled={disabled} onClick={() => onChange(tags.filter((x) => x !== t))}>
              ×
            </button>
          </span>
        ))}
        <input
          id={id}
          className="min-w-[6rem] flex-1 bg-transparent text-sm outline-none"
          value={draft}
          disabled={disabled}
          placeholder={tags.length ? "" : field.placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          onBlur={add}
        />
      </div>
    </FieldShell>
  );
}

export default function MultiChoice(props: FormFieldProps) {
  const { field, value, onChange, error, disabled } = props;
  if (field.type === "tags" || !field.options?.length) return <Tags {...props} />;
  const selected = asList(value);
  const toggle = (o: string) => onChange(selected.includes(o) ? selected.filter((x) => x !== o) : [...selected, o]);
  return (
    <fieldset aria-invalid={Boolean(error)} className="space-y-1.5">
      <legend className="text-sm font-medium text-fg">
        {field.label}
        {field.required && <span className="text-danger"> *</span>}
      </legend>
      <div className="flex flex-wrap gap-x-4 gap-y-2 pt-1">
        {field.options.map((o) => (
          <label key={o} className="flex items-center gap-2 text-sm text-fg">
            <input type="checkbox" disabled={disabled} checked={selected.includes(o)} onChange={() => toggle(o)} className="accent-[var(--sparc-primary)]" />
            {o}
          </label>
        ))}
      </div>
      {error ? <p className="text-xs text-danger">{error}</p> : field.helpText ? <p className="text-xs text-muted">{field.helpText}</p> : null}
    </fieldset>
  );
}
