// Record validation. Same rules as the platform backend
// (lib/portalConfig.js schemaForPortalField), so the form and the server agree.
import { z } from "zod";
import type { FieldDef } from "@contracts";

type FieldWithSettings = FieldDef & { settings?: Record<string, unknown> };

function numberSetting(value: unknown): number | undefined {
  if (value === "" || value === undefined || value === null) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

const optional = (schema: z.ZodType) => z.preprocess((v) => (v === "" ? undefined : v), schema.optional().nullable());

export function schemaForField(field: FieldWithSettings): z.ZodType {
  const settings = field.settings ?? {};
  let schema: z.ZodType;
  switch (field.type) {
    case "email":
      schema = z.string().email(`${field.label} must be a valid email.`);
      break;
    case "number":
    case "currency":
    case "percentage":
    case "rating": {
      let n = z.coerce.number({ message: `${field.label} must be a number.` });
      const min = numberSetting(settings.min);
      const max = numberSetting(settings.max);
      if (min !== undefined) n = n.min(min, `${field.label} must be at least ${min}.`);
      if (max !== undefined) n = n.max(max, `${field.label} must be at most ${max}.`);
      schema = n;
      break;
    }
    case "select":
    case "radio": {
      const options = (field.options ?? []).filter(Boolean);
      schema = options.length
        ? z.string().refine((v) => options.includes(v), { message: `${field.label} must be one of the options.` })
        : z.string();
      break;
    }
    case "multi-select":
    case "checkbox-group":
    case "tags":
      schema = z.preprocess((v) => {
        if (Array.isArray(v)) return v;
        if (typeof v === "string") return v.split(",").map((s) => s.trim()).filter(Boolean);
        return [];
      }, z.array(z.string()));
      break;
    case "checkbox":
    case "toggle":
      schema = z.boolean();
      break;
    case "address":
    case "json":
      schema = z.union([z.record(z.string(), z.unknown()), z.string()]);
      break;
    default: {
      let s = z.string();
      const minLength = numberSetting(settings.minLength);
      const maxLength = numberSetting(settings.maxLength);
      if (minLength !== undefined) s = s.min(minLength);
      if (maxLength !== undefined) s = s.max(maxLength);
      schema = s;
    }
  }

  if (field.required) {
    if (["multi-select", "checkbox-group", "tags"].includes(field.type)) {
      return schema.refine((v) => Array.isArray(v) && v.length > 0, { message: `${field.label} is required.` });
    }
    if (field.type === "checkbox" || field.type === "toggle") return schema;
    return z.preprocess((v) => (v === "" || v === null ? undefined : v), schema.optional()).refine((v) => v !== undefined, {
      message: `${field.label} is required.`,
    });
  }
  return optional(schema);
}

export function validateRecord(
  fields: FieldDef[],
  values: Record<string, unknown>
): { ok: true; data: Record<string, unknown> } | { ok: false; errors: Record<string, string> } {
  const shape: Record<string, z.ZodType> = {};
  for (const f of fields) shape[f.key] = schemaForField(f);
  const result = z.object(shape).strip().safeParse(values);
  if (result.success) {
    // Empty optional values are stored as null.
    const data: Record<string, unknown> = {};
    for (const f of fields) data[f.key] = result.data[f.key] === undefined ? null : result.data[f.key];
    return { ok: true, data };
  }
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? "");
    if (key && !errors[key]) errors[key] = issue.message;
  }
  return { ok: false, errors };
}

/** Starting value for a new record's field. */
export function emptyValue(field: FieldDef): unknown {
  if (["multi-select", "checkbox-group", "tags"].includes(field.type)) return [];
  if (field.type === "checkbox" || field.type === "toggle") return false;
  return "";
}
