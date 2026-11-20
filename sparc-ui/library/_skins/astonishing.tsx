// Astonishing: wow effects — moving aurora backgrounds, cursor spotlight with
// 3D tilt, endless marquees. Site pages only. Respects reduce-motion: every
// effect falls back to a calm, static version.
import { useRef, type MouseEvent } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import { cn } from "@core/ui";
import { amazingSkin } from "./amazing";
import type { Skin, WrapProps } from "./types";

const tint = (mix: number, token = "--sparc-primary") => `color-mix(in srgb, var(${token}) ${mix}%, transparent)`;

/** Moving aurora of brand colours over a faint grid. */
function AuroraBackdrop({ variant }: { variant: "hero" | "cta" | "page" }) {
  const reduce = useReducedMotion();
  const drift = (a: number) => (reduce ? undefined : { rotate: [0, a, 0], scale: [1, 1.12, 1] });
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div
        className="absolute inset-0 opacity-60"
        style={{
          backgroundImage: `linear-gradient(${tint(10, "--sparc-border")} 1px, transparent 1px), linear-gradient(90deg, ${tint(10, "--sparc-border")} 1px, transparent 1px)`,
          backgroundSize: "44px 44px",
          maskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)",
        }}
      />
      <motion.div
        className="absolute -inset-[30%] blur-3xl"
        style={{
          background: `conic-gradient(from 90deg at 50% 50%, ${tint(variant === "cta" ? 55 : 35)}, ${tint(25, "--sparc-primary-hover")}, ${tint(30, "--sparc-primary-soft")}, ${tint(variant === "cta" ? 55 : 35)})`,
        }}
        animate={drift(25)}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute left-1/2 top-0 h-64 w-[60%] -translate-x-1/2 rounded-full blur-3xl"
        style={{ background: tint(40) }}
        animate={reduce ? undefined : { opacity: [0.5, 0.9, 0.5] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}

/** Card wrapper: follows the cursor with a soft spotlight and a gentle 3D tilt. */
function SpotlightTilt({ children, className }: WrapProps) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const rotateX = useSpring(rx, { stiffness: 180, damping: 18 });
  const rotateY = useSpring(ry, { stiffness: 180, damping: 18 });
  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    el.style.setProperty("--spot-x", `${px * 100}%`);
    el.style.setProperty("--spot-y", `${py * 100}%`);
    if (!reduce) {
      ry.set((px - 0.5) * 10);
      rx.set(-(py - 0.5) * 10);
    }
  };
  const onLeave = () => {
    rx.set(0);
    ry.set(0);
  };
  return (
    <motion.div
      ref={ref}
      className={cn("group/spot relative", className)}
      style={reduce ? undefined : { rotateX, rotateY, transformPerspective: 900 }}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
    >
      {children}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-sparc opacity-0 transition-opacity duration-300 group-hover/spot:opacity-100"
        style={{ background: `radial-gradient(380px circle at var(--spot-x, 50%) var(--spot-y, 50%), ${tint(20)}, transparent 60%)` }}
      />
    </motion.div>
  );
}

/** Endless horizontal scroll. Reduced motion: a normal wrapped row. */
function Marquee({ children, className }: WrapProps) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={cn("flex flex-wrap gap-3", className)}>{children}</div>;
  const track = (hidden: boolean) => (
    <motion.div
      aria-hidden={hidden || undefined}
      className="flex shrink-0 gap-3 pr-3"
      animate={{ x: ["0%", "-100%"] }}
      transition={{ duration: 32, ease: "linear", repeat: Infinity }}
    >
      {children}
    </motion.div>
  );
  return (
    <div className={cn("relative flex overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]", className)}>
      {track(false)}
      {track(true)}
    </div>
  );
}

export const astonishingSkin: Skin = {
  ...amazingSkin,
  level: "astonishing",
  card: cn(amazingSkin.card, "bg-surface/80 backdrop-blur"),
  cardInteractive: cn(amazingSkin.card, "overflow-hidden bg-surface/80 backdrop-blur transition-shadow duration-300 hover:shadow-xl hover:shadow-primary/20"),
  cardFeatured: "border-transparent ring-2 ring-primary shadow-[0_0_48px_-12px_var(--sparc-primary)]",
  heading: cn(amazingSkin.heading, "sm:text-5xl"),
  highlight: "bg-gradient-to-r from-primary via-primary-hover to-primary bg-clip-text text-transparent drop-shadow-[0_0_18px_var(--sparc-primary-soft)]",
  chip: "rounded-full border border-primary/30 bg-primary-soft/60 px-3.5 py-1.5 text-sm font-medium text-primary shadow-sm backdrop-blur",
  Hover: SpotlightTilt,
  Backdrop: AuroraBackdrop,
  Marquee,
};
