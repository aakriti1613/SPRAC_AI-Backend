import { useState, type FormEvent } from "react";
import type { ProfileProps } from "@contracts";
import { cn } from "@core/ui";
import { useSkin } from "../_skins/context";
import { FieldShell } from "../_shared/basic";

export default function Profile({ user, fields, values, onSave, saving, error }: ProfileProps) {
  const s = useSkin();
  const [draft, setDraft] = useState<Record<string, unknown>>(values);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void onSave(draft);
  };
  return (
    <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
      <div className={cn(s.card, "flex flex-col items-center p-6 text-center")}>
        {user.avatarUrl ? (
          <img src={user.avatarUrl} alt="" className="h-24 w-24 rounded-full object-cover" />
        ) : (
          <span className="flex h-24 w-24 items-center justify-center rounded-full bg-primary-soft text-3xl font-semibold text-primary" aria-hidden>
            {user.name.slice(0, 1).toUpperCase() || "?"}
          </span>
        )}
        <p className="mt-4 font-semibold text-fg">{user.name}</p>
        <p className="text-sm text-muted">{user.email}</p>
        {user.role && <p className="mt-2 rounded-sparc bg-bg px-2 py-0.5 text-xs text-muted">{user.role}</p>}
      </div>
      <form onSubmit={submit} className={cn(s.card, "space-y-5 p-6")} aria-label="Edit profile">
        <div className="grid gap-5 sm:grid-cols-2">
          {fields.map((f) => (
            <div key={f.key} className={cn(f.width === "full" && "sm:col-span-2")}>
              <FieldShell id={`profile-${f.key}`} label={f.label} required={f.required} helpText={f.helpText}>
                <input
                  id={`profile-${f.key}`}
                  type={f.type === "email" ? "email" : f.type === "url" ? "url" : "text"}
                  required={f.required}
                  placeholder={f.placeholder}
                  className={s.input}
                  value={String(draft[f.key] ?? "")}
                  onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                />
              </FieldShell>
            </div>
          ))}
        </div>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex justify-end">
          <button type="submit" className={s.button("primary")} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
