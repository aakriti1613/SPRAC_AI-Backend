// Good: polished — soft shadows, hover lift, smooth CSS transitions. No animation library.
import { buttonClass, cn, headingClass, inputClass } from "@core/ui";
import { plainEffects } from "./plain";
import type { Skin } from "./types";

const card = "rounded-sparc border border-border/80 bg-surface shadow-sm";

export const goodSkin: Skin = {
  level: "good",
  card,
  cardInteractive: cn(card, "transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"),
  cardFeatured: "border-primary/60 ring-1 ring-primary/20",
  button: (variant = "primary", extra) =>
    buttonClass(
      variant,
      cn(
        "transition-all duration-200 active:scale-[0.98]",
        variant === "primary" && "shadow-sm shadow-primary/30 hover:shadow-md hover:shadow-primary/30",
        variant === "outline" && "shadow-sm hover:border-primary/40",
        extra
      )
    ),
  input: cn(inputClass, "shadow-sm transition-shadow focus:shadow-md"),
  heading: cn(headingClass, "tracking-tight"),
  eyebrow: "inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-primary before:h-px before:w-6 before:bg-primary",
  highlight: "text-primary underline decoration-primary/30 decoration-4 underline-offset-8",
  chip: "rounded-full border border-border bg-surface px-3 py-1 text-sm text-fg shadow-sm transition-colors hover:border-primary/40 hover:text-primary",
  iconBadge: "flex items-center justify-center rounded-sparc bg-gradient-to-br from-primary-soft to-surface text-primary shadow-sm ring-1 ring-primary/10",
  sectionAlt: "bg-gradient-to-b from-primary-soft/30 to-transparent",
  navbar: "border-b border-border/60 bg-surface/80 shadow-sm backdrop-blur-md",
  ...plainEffects,
};
