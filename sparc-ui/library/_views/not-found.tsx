import type { NotFoundProps } from "@contracts";
import { SparcLink } from "@core/link";
import { cn } from "@core/ui";
import { useSkin } from "../_skins/context";

export default function NotFoundView({ title, message, homeHref }: NotFoundProps) {
  const s = useSkin();
  return (
    <main className="relative isolate flex min-h-[70vh] flex-col items-center justify-center overflow-hidden px-6 text-center">
      <s.Backdrop variant="page" />
      <s.Reveal>
        <p className={cn("text-6xl font-bold", s.level === "basic" ? "text-primary" : s.highlight, s.level === "astonishing" && "text-8xl")}>404</p>
        <h1 className="mt-4 text-2xl font-semibold text-fg">{title}</h1>
        <p className="mx-auto mt-2 max-w-md text-muted">{message}</p>
        <SparcLink href={homeHref} className={s.button("primary", "mt-6")}>
          Go home
        </SparcLink>
      </s.Reveal>
    </main>
  );
}
