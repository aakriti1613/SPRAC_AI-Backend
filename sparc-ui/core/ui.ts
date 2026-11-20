// Small shared helpers for components: class merging and Basic-level class
// recipes. Everything uses theme tokens, never fixed colours.
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export type ButtonVariant = "primary" | "outline" | "ghost" | "danger";

export function buttonClass(variant: ButtonVariant = "primary", extra?: string): string {
  return cn(
    "inline-flex h-control items-center justify-center gap-2 rounded-sparc px-4 text-sm font-medium transition-colors",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60",
    variant === "primary" && "bg-primary text-primary-foreground hover:bg-primary-hover",
    variant === "outline" && "border border-border bg-surface text-fg hover:bg-bg",
    variant === "ghost" && "text-fg hover:bg-bg",
    variant === "danger" && "bg-danger text-white hover:opacity-90",
    extra
  );
}

export const inputClass = cn(
  "h-control w-full rounded-sparc border border-border bg-surface px-3 text-sm text-fg placeholder:text-muted",
  "focus:outline-2 focus:outline-offset-1 focus:outline-primary disabled:opacity-60"
);

export const cardClass = "rounded-sparc border border-border bg-surface";

export const sectionClass = "mx-auto w-full max-w-6xl px-6 py-16";

export const headingClass = "text-2xl font-semibold tracking-tight text-fg sm:text-3xl";

/** Turn "Fee paid" into a stable DOM id. */
export function domId(...parts: string[]): string {
  return parts.join("-").toLowerCase().replace(/[^a-z0-9-]+/g, "-");
}
