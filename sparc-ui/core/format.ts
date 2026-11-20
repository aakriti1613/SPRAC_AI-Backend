// Show stored values nicely in tables and detail views.
import type { FieldDef } from "@contracts";

export type FieldType = FieldDef["type"];

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const num = new Intl.NumberFormat("en-IN");

export function formatCurrency(value: number): string {
  return inr.format(value);
}

export function formatValue(type: FieldType | undefined, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  switch (type) {
    case "currency":
      return Number.isFinite(Number(value)) ? inr.format(Number(value)) : String(value);
    case "number":
    case "rating":
      return Number.isFinite(Number(value)) ? num.format(Number(value)) : String(value);
    case "percentage":
      return `${value}%`;
    case "checkbox":
    case "toggle":
      return value ? "Yes" : "No";
    case "date":
      return formatDate(String(value));
    case "datetime":
      return formatDate(String(value), true);
    case "multi-select":
    case "tags":
    case "checkbox-group":
      return Array.isArray(value) ? value.join(", ") : String(value);
    case "address":
    case "json":
      return typeof value === "object" ? Object.values(value as Record<string, unknown>).filter(Boolean).join(", ") : String(value);
    default:
      return Array.isArray(value) ? value.join(", ") : String(value);
  }
}

export function formatDate(iso: string, withTime = false): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

/** "2 hours ago" style text. */
export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const days = Math.round(h / 24);
  return days < 30 ? `${days} d ago` : formatDate(iso);
}
