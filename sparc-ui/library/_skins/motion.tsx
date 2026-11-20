// Animated effects shared by Amazing and Astonishing (uses the `motion` library).
// Every effect respects the visitor's "reduce motion" setting.
import { useEffect, useRef, type ReactNode } from "react";
import { animate, MotionConfig, motion, useInView, useReducedMotion } from "motion/react";
import type { ItemProps, ListProps, WrapProps } from "./types";

const EASE = [0.22, 1, 0.36, 1] as const;

export function MotionFrame({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

export function Reveal({ children, className, delay = 0 }: WrapProps & { delay?: number }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.55, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
}

const container = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } };
const child = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } } };

export function List({ as = "ul", className, children }: ListProps) {
  const Tag = as === "ol" ? motion.ol : as === "div" ? motion.div : motion.ul;
  return (
    <Tag className={className} variants={container} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.1 }}>
      {children}
    </Tag>
  );
}

export function Item({ as = "li", className, children }: ItemProps) {
  const Tag = as === "div" ? motion.div : motion.li;
  return (
    <Tag className={className} variants={child}>
      {children}
    </Tag>
  );
}

export function Lift({ children, className }: WrapProps) {
  return (
    <motion.div className={className} whileHover={{ y: -6 }} transition={{ type: "spring", stiffness: 300, damping: 22 }}>
      {children}
    </motion.div>
  );
}

/** "₹2,62,200" -> { prefix: "₹", number: 262200, suffix: "", decimals: 0, grouping: "en-IN" } */
export function parseCount(value: string) {
  const m = /^(\D*?)(\d[\d,]*(?:\.\d+)?)(.*)$/.exec(value);
  if (!m) return null;
  const raw = m[2];
  const decimals = raw.includes(".") ? raw.split(".")[1].length : 0;
  const grouping = !raw.includes(",") ? null : /\d,\d{2},\d{3}/.test(raw) ? "en-IN" : "en-US";
  return { prefix: m[1], number: Number(raw.replace(/,/g, "")), suffix: m[3], decimals, grouping };
}

export function formatCount(n: number, p: NonNullable<ReturnType<typeof parseCount>>): string {
  const body = p.grouping
    ? n.toLocaleString(p.grouping, { minimumFractionDigits: p.decimals, maximumFractionDigits: p.decimals })
    : n.toFixed(p.decimals);
  return `${p.prefix}${body}${p.suffix}`;
}

/** Counts up when visible. Screen readers always get the final value. */
export function Count({ value }: { value: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  useEffect(() => {
    const parsed = parseCount(value);
    const el = ref.current;
    if (!inView || reduce || !parsed || !el) return;
    const controls = animate(0, parsed.number, {
      duration: 1.2,
      ease: "easeOut",
      onUpdate: (v) => {
        el.textContent = formatCount(v, parsed);
      },
      onComplete: () => {
        el.textContent = value;
      },
    });
    return () => controls.stop();
  }, [inView, reduce, value]);
  return (
    <span>
      <span ref={ref} aria-hidden>
        {value}
      </span>
      <span className="sr-only">{value}</span>
    </span>
  );
}

export function Grow({ percent, className }: { percent: number; className?: string }) {
  const p = Math.max(0, Math.min(100, percent));
  return (
    <motion.div
      className={className}
      initial={{ width: 0 }}
      whileInView={{ width: `${p}%` }}
      viewport={{ once: true }}
      transition={{ duration: 0.9, ease: EASE }}
      style={{ width: `${p}%` }}
    />
  );
}

const blob = (mix: number) => `color-mix(in srgb, var(--sparc-primary) ${mix}%, transparent)`;

/** Two soft, slowly floating light blobs. */
export function SoftBackdrop({ variant }: { variant: "hero" | "cta" | "page" }) {
  const reduce = useReducedMotion();
  const float = (dx: number, dy: number) => (reduce ? undefined : { x: [0, dx, 0], y: [0, dy, 0] });
  const size = variant === "cta" ? "h-48 w-48" : "h-80 w-80";
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <motion.div
        className={`absolute -left-16 -top-24 ${size} rounded-full blur-3xl`}
        style={{ background: blob(variant === "cta" ? 45 : 28) }}
        animate={float(24, 18)}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className={`absolute -bottom-24 -right-10 ${size} rounded-full blur-3xl`}
        style={{ background: "color-mix(in srgb, var(--sparc-primary-hover) 22%, transparent)" }}
        animate={float(-20, -14)}
        transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}
