import type { FormEvent } from "react";
import type { RecordFormProps } from "@contracts";
import { cn } from "@core/ui";
import { useSkin } from "../_skins/context";

const WIDTH = { full: "sm:col-span-6", half: "sm:col-span-3", third: "sm:col-span-2" } as const;

export default function RecordForm({ title, fields, onSubmit, onCancel, submitting, renderField }: RecordFormProps) {
  const s = useSkin();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void onSubmit();
  };
  return (
    <form onSubmit={submit} noValidate aria-label={title} className={cn(s.card, "p-6")}>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-6">
        {fields.map((f) => (
          <div key={f.key} className={WIDTH[f.width ?? "full"]}>
            {renderField(f)}
          </div>
        ))}
      </div>
      <div className="mt-8 flex justify-end gap-2 border-t border-border pt-5">
        <button type="button" className={s.button("outline")} onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className={s.button("primary")} disabled={submitting}>
          {submitting ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
