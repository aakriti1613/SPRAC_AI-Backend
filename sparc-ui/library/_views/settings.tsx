import { useState, type FormEvent } from "react";
import type { FieldDef, SettingsProps } from "@contracts";
import { cn } from "@core/ui";
import { useSkin } from "../_skins/context";
import { FieldShell } from "../_shared/basic";

function Control({ field, value, onChange }: { field: FieldDef; value: unknown; onChange(v: unknown): void }) {
  const s = useSkin();
  const id = `setting-${field.key}`;
  if (field.type === "toggle" || field.type === "checkbox") {
    return (
      <label htmlFor={id} className="flex items-center justify-between gap-4 text-sm text-fg">
        {field.label}
        <input id={id} type="checkbox" className="h-5 w-5 accent-[var(--sparc-primary)]" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
      </label>
    );
  }
  return (
    <FieldShell id={id} label={field.label} helpText={field.helpText}>
      {field.options?.length ? (
        <select id={id} className={s.input} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)}>
          {field.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <input id={id} className={s.input} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />
      )}
    </FieldShell>
  );
}

export default function Settings({ sections, values, onSave, saving, error }: SettingsProps) {
  const s = useSkin();
  const [draft, setDraft] = useState<Record<string, unknown>>(values);
  const [saved, setSaved] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    await onSave(draft);
    setSaved(true);
  };
  return (
    <form onSubmit={submit} className="space-y-6" aria-label="Settings">
      {sections.map((section) => (
        <fieldset key={section.id} className={cn(s.card, "p-6")}>
          <legend className="px-1 font-semibold text-fg">{section.title}</legend>
          <div className="mt-2 grid gap-5 sm:grid-cols-2">
            {section.fields.map((f) => (
              <Control key={f.key} field={f} value={draft[f.key]} onChange={(v) => setDraft((d) => ({ ...d, [f.key]: v }))} />
            ))}
          </div>
        </fieldset>
      ))}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex items-center justify-end gap-3">
        {saved && !saving && !error && (
          <span role="status" className="text-sm text-success">
            Saved
          </span>
        )}
        <button type="submit" className={s.button("primary")} disabled={saving}>
          {saving ? "Saving…" : "Save settings"}
        </button>
      </div>
    </form>
  );
}
