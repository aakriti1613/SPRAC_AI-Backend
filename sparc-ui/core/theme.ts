// Turns the theme settings from a site config into CSS variables (see theme/sparc.css).
export type Radius = "none" | "sm" | "md" | "lg" | "full";
export type Density = "compact" | "comfortable" | "spacious";
export type ControlSize = "sm" | "md" | "lg";
export type FontChoice = "system" | "serif" | "mono";

export interface ThemeSettings {
  /** Brand colour, 6-digit hex. */
  primary: string;
  mode?: "light" | "dark";
  radius?: Radius;
  density?: Density;
  buttonSize?: ControlSize;
  font?: FontChoice;
}

const RADIUS: Record<Radius, string> = { none: "0px", sm: "4px", md: "8px", lg: "14px", full: "9999px" };
const DENSITY: Record<Density, string> = { compact: "0.85", comfortable: "1", spacious: "1.2" };
const CONTROL: Record<ControlSize, string> = { sm: "2rem", md: "2.5rem", lg: "3rem" };
const FONTS: Record<FontChoice, string> = {
  system: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  serif: 'ui-serif, Georgia, Cambria, "Times New Roman", serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
};

const HEX = /^#[0-9a-f]{6}$/i;

function toRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((c) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, "0")).join("")}`;
}

export function mix(hex: string, other: string, weight: number): string {
  const a = toRgb(hex);
  const b = toRgb(other);
  return toHex([0, 1, 2].map((i) => a[i] * (1 - weight) + b[i] * weight) as [number, number, number]);
}

/** WCAG relative luminance. */
function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** White or near-black text, whichever reads better on `background`. */
export function readableOn(background: string): string {
  return contrastRatio(background, "#ffffff") >= contrastRatio(background, "#0f172a") ? "#ffffff" : "#0f172a";
}

/** CSS variables for a theme (pure, easy to test). */
export function themeVariables(settings: ThemeSettings): Record<string, string> {
  const primary = HEX.test(settings.primary) ? settings.primary.toLowerCase() : "#2563eb";
  const dark = settings.mode === "dark";
  return {
    "--sparc-primary": primary,
    "--sparc-primary-hover": mix(primary, "#000000", 0.15),
    "--sparc-primary-soft": dark ? mix(primary, "#000000", 0.7) : mix(primary, "#ffffff", 0.85),
    "--sparc-primary-foreground": readableOn(primary),
    "--sparc-radius": RADIUS[settings.radius ?? "md"],
    "--sparc-density": DENSITY[settings.density ?? "comfortable"],
    "--sparc-control-h": CONTROL[settings.buttonSize ?? "md"],
    "--sparc-font": FONTS[settings.font ?? "system"],
  };
}

export function applyTheme(settings: ThemeSettings, root: HTMLElement = document.documentElement): void {
  for (const [name, value] of Object.entries(themeVariables(settings))) root.style.setProperty(name, value);
  root.dataset.theme = settings.mode === "dark" ? "dark" : "light";
}
