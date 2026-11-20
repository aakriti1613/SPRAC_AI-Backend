// A skin = the LOOK of one style level. Views (library/_views) describe the
// structure of a room once; a skin supplies classes and effect components.
// Basic/Good effects are plain elements (no animation library); Amazing and
// Astonishing use `motion` — so packages stay within each level's rules.
import type { ComponentType, ReactNode } from "react";
import type { StyleLevel } from "@contracts";
import type { ButtonVariant } from "@core/ui";

export interface WrapProps {
  children: ReactNode;
  className?: string;
}
export interface ListProps extends WrapProps {
  as?: "ul" | "ol" | "div";
}
export interface ItemProps extends WrapProps {
  as?: "li" | "div";
}

export interface Skin {
  level: StyleLevel;
  // ---- classes ----
  card: string;
  /** Card that reacts to hover. */
  cardInteractive: string;
  /** Extra classes for highlighted cards (featured project, recommended plan). */
  cardFeatured: string;
  button(variant?: ButtonVariant, extra?: string): string;
  input: string;
  heading: string;
  eyebrow: string;
  /** Emphasis inside a headline. */
  highlight: string;
  chip: string;
  iconBadge: string;
  /** Background for alternating sections. */
  sectionAlt: string;
  /** Classes for the sticky top bar. */
  navbar: string;
  // ---- effects ----
  /** Wraps the whole room once (e.g. motion's reduced-motion setting). */
  Frame?: ComponentType<{ children: ReactNode }>;
  /** Fades/slides content in when it scrolls into view. */
  Reveal: ComponentType<WrapProps & { delay?: number }>;
  /** A list whose items appear one after another. */
  List: ComponentType<ListProps>;
  Item: ComponentType<ItemProps>;
  /** Wraps a card: lift, tilt or spotlight on hover. */
  Hover: ComponentType<WrapProps>;
  /** Shows a number ("12+", "₹2,62,200", "4.8★"), animated at higher levels. */
  Count: ComponentType<{ value: string }>;
  /** Progress bar fill, animated at higher levels. */
  Grow: ComponentType<{ percent: number; className?: string }>;
  /** Decorative background layer (absolute, behind content). */
  Backdrop: ComponentType<{ variant: "hero" | "cta" | "page" }>;
  /** Endless horizontal scroll; null when the level has none. */
  Marquee: ComponentType<WrapProps> | null;
}
