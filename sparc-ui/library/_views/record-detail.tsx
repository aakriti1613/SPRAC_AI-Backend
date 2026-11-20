import type { RecordDetailProps } from "@contracts";
import { formatValue } from "@core/format";
import { Icon } from "@core/icons";
import { cn } from "@core/ui";
import { useSkin } from "../_skins/context";

const IMAGE_TYPES = new Set(["image", "avatar"]);

export default function RecordDetail({ title, fields, record, onEdit, onDelete }: RecordDetailProps) {
  const s = useSkin();
  return (
    <s.Reveal>
    <section aria-label={title} className={cn(s.card, "p-6")}>
      <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
        {fields.map((f) => {
          const v = record[f.key];
          return (
            <div key={f.key} className={cn(f.width === "full" && "sm:col-span-2")}>
              <dt className="text-xs uppercase tracking-wide text-muted">{f.label}</dt>
              <dd className="mt-1 whitespace-pre-line break-words text-fg">
                {IMAGE_TYPES.has(f.type) && typeof v === "string" && v ? (
                  <img src={v} alt={f.label} className="h-24 w-24 rounded-sparc object-cover" />
                ) : f.type === "file" && typeof v === "string" && v ? (
                  <a href={v} target="_blank" rel="noreferrer" className="text-primary underline">
                    Open file
                  </a>
                ) : (
                  formatValue(f.type, v)
                )}
              </dd>
            </div>
          );
        })}
      </dl>
      {(onEdit || onDelete) && (
        <div className="mt-8 flex justify-end gap-2 border-t border-border pt-5">
          {onDelete && (
            <button type="button" className={s.button("outline", "text-danger")} onClick={onDelete}>
              <Icon name="Trash2" /> Delete
            </button>
          )}
          {onEdit && (
            <button type="button" className={s.button("primary")} onClick={onEdit}>
              <Icon name="Pencil" /> Edit
            </button>
          )}
        </div>
      )}
    </section>
    </s.Reveal>
  );
}
