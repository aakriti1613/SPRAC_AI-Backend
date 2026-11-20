import type { ResumeDownloadProps } from "@contracts";
import { Icon } from "@core/icons";
import { cn } from "@core/ui";
import { useSkin } from "../_skins/context";

export default function ResumeDownloadView({ label, href, note }: ResumeDownloadProps) {
  const s = useSkin();
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-8">
      <s.Reveal>
        <div className={cn(s.card, "flex flex-wrap items-center justify-between gap-4 p-6", s.level !== "basic" && "bg-gradient-to-r from-primary-soft/50 to-surface")}>
          <div className="flex items-center gap-3">
            <span className={cn(s.iconBadge, "h-11 w-11")}>
              <Icon name="FileText" className="h-5 w-5" />
            </span>
            <div>
              <p className="font-medium text-fg">Résumé</p>
              {note && <p className="text-sm text-muted">{note}</p>}
            </div>
          </div>
          <a href={href} download className={s.button("primary")}>
            <Icon name="Download" /> {label}
          </a>
        </div>
      </s.Reveal>
    </section>
  );
}
