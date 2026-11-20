import { useId, useState, type DragEvent } from "react";
import type { FileUploadProps } from "@contracts";
import { Icon } from "@core/icons";
import { cn } from "@core/ui";
import { useSkin } from "../_skins/context";

export default function FileUpload({ accept, multiple, maxSizeMb, onUpload, uploading, error }: FileUploadProps) {
  const s = useSkin();
  const id = useId();
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string>();

  const handle = (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (!files.length) return;
    const tooBig = maxSizeMb ? files.find((f) => f.size > maxSizeMb * 1024 * 1024) : undefined;
    if (tooBig) {
      setLocalError(`“${tooBig.name}” is larger than ${maxSizeMb} MB.`);
      return;
    }
    setLocalError(undefined);
    void onUpload(multiple ? files : files.slice(0, 1));
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    handle(e.dataTransfer.files);
  };

  return (
    <div>
      <label
        htmlFor={id}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-sparc border-2 border-dashed px-4 py-6 text-center text-sm",
          dragging ? "border-primary bg-primary-soft" : "border-border bg-bg text-muted hover:border-primary",
          s.level !== "basic" && "transition-colors duration-200 hover:bg-primary-soft/40"
        )}
      >
        <Icon name="Upload" className="h-5 w-5" />
        {uploading ? "Uploading…" : "Drop a file here or click to choose"}
        {maxSizeMb && <span className="text-xs text-muted">Up to {maxSizeMb} MB</span>}
      </label>
      <input id={id} type="file" className="sr-only" accept={accept} multiple={multiple} disabled={uploading} onChange={(e) => handle(e.target.files)} />
      {(localError || error) && (
        <p role="alert" className="mt-1.5 text-xs text-danger">
          {localError ?? error}
        </p>
      )}
    </div>
  );
}
