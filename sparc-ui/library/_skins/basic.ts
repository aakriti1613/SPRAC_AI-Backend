// Basic: clean, flat, simple. No animation.
import { buttonClass, cardClass, headingClass, inputClass } from "@core/ui";
import { plainEffects } from "./plain";
import type { Skin } from "./types";

export const basicSkin: Skin = {
  level: "basic",
  card: cardClass,
  cardInteractive: cardClass,
  cardFeatured: "border-primary",
  button: (variant, extra) => buttonClass(variant, extra),
  input: inputClass,
  heading: headingClass,
  eyebrow: "text-sm font-medium text-primary",
  highlight: "text-primary",
  chip: "rounded-sparc border border-border px-2.5 py-1 text-sm text-fg",
  iconBadge: "flex items-center justify-center rounded-sparc bg-primary-soft text-primary",
  sectionAlt: "",
  navbar: "border-b border-border bg-surface/90 backdrop-blur",
  ...plainEffects,
};
