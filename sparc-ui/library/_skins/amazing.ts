// Amazing: smooth animations and gradients (motion). Respects reduce-motion.
import { cn } from "@core/ui";
import { goodSkin } from "./good";
import { Count, Grow, Item, Lift, List, MotionFrame, Reveal, SoftBackdrop } from "./motion";
import type { Skin } from "./types";

export const amazingSkin: Skin = {
  ...goodSkin,
  level: "amazing",
  cardInteractive: cn(goodSkin.card, "transition-shadow duration-300 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10"),
  cardFeatured: "border-primary/50 shadow-lg shadow-primary/15 ring-1 ring-primary/25",
  heading: cn(goodSkin.heading, "text-3xl sm:text-4xl"),
  highlight: "bg-gradient-to-r from-primary to-primary-hover bg-clip-text text-transparent",
  sectionAlt: "bg-gradient-to-b from-primary-soft/40 via-transparent to-transparent",
  Frame: MotionFrame,
  Reveal,
  List,
  Item,
  Hover: Lift,
  Count,
  Grow,
  Backdrop: SoftBackdrop,
  Marquee: null,
};
