// Believable demo rows for any module, built from its fields (demo mode only).
import type { FieldDef } from "@contracts";
import type { PortalModule } from "@core/config";

const FIRST = ["Aarav", "Ananya", "Ishaan", "Meera", "Kabir", "Priya", "Rohan", "Saanvi", "Nikhil", "Diya", "Arjun", "Zoya"];
const LAST = ["Sharma", "Mehta", "Rao", "Kapoor", "Iyer", "Singh", "Nair", "Desai", "Gupta", "Menon"];
const CITIES = ["Mumbai", "Bengaluru", "Delhi", "Pune", "Hyderabad", "Chennai"];

const pick = <T,>(list: T[], i: number): T => list[i % list.length];
const nameAt = (i: number) => `${pick(FIRST, i)} ${pick(LAST, i + 3)}`;

function dateAt(i: number): string {
  const d = new Date(Date.UTC(2026, (i * 3) % 11, ((i * 7) % 27) + 1));
  return d.toISOString().slice(0, 10);
}

function hint(field: FieldDef) {
  const text = `${field.key} ${field.label}`.toLowerCase();
  return {
    name: /name|customer|client|person|holder|title|patient|student|employee/.test(text),
    city: /city|location|region|address/.test(text),
  };
}

export function seedValue(field: FieldDef, i: number, module: PortalModule): unknown {
  const options = (field.options ?? []).filter(Boolean);
  if (options.length && (field.type === "select" || field.type === "radio")) return pick(options, i);
  if (options.length && (field.type === "multi-select" || field.type === "checkbox-group")) return [pick(options, i)];
  switch (field.type) {
    case "email":
      return `${pick(FIRST, i).toLowerCase()}.${pick(LAST, i + 3).toLowerCase()}@example.in`;
    case "phone":
      return `+91 98${String(10000000 + i * 1379131).slice(0, 8)}`;
    case "number":
      return (i % 9) + 1;
    case "rating":
      return (i % 5) + 1;
    case "currency":
      return 1500 + ((i * 3700) % 48000);
    case "percentage":
      return (i * 13) % 100;
    case "checkbox":
    case "toggle":
      return i % 3 !== 0;
    case "date":
      return dateAt(i);
    case "time":
      return `${String(9 + (i % 8)).padStart(2, "0")}:30`;
    case "datetime":
      return `${dateAt(i)}T10:30:00.000Z`;
    case "textarea":
      return `${module.singularName} note ${i + 1}: follow up next week.`;
    case "tags":
      return ["priority", pick(CITIES, i).toLowerCase()];
    case "url":
      return `https://example.in/${module.id}/${i + 1}`;
    case "color":
      return pick(["#2563eb", "#16a34a", "#dc2626", "#7c3aed"], i);
    case "file":
    case "image":
    case "avatar":
    case "reference":
    case "json":
    case "address":
    case "password":
      return null;
    default: {
      const h = hint(field);
      if (h.name) return nameAt(i);
      if (h.city) return pick(CITIES, i);
      return `${module.singularName} ${i + 1}`;
    }
  }
}

export function seedRows(module: PortalModule, count: number): Record<string, unknown>[] {
  return Array.from({ length: count }, (_, i) => {
    const row: Record<string, unknown> = {};
    for (const field of module.fields) row[field.key] = seedValue(field, i, module);
    return row;
  });
}
