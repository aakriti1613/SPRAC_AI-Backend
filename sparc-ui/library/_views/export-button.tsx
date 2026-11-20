import type { ExportButtonProps } from "@contracts";
import { Icon } from "@core/icons";
import { useSkin } from "../_skins/context";

export default function ExportButton({ label, onExport, busy }: ExportButtonProps) {
  const s = useSkin();
  return (
    <button type="button" className={s.button("outline")} onClick={() => void onExport()} disabled={busy}>
      <Icon name="Download" /> {busy ? "Exporting…" : label}
    </button>
  );
}
