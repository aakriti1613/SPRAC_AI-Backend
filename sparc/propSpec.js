// A tiny language for describing a room's "plug shape" (the props every
// component in that room must accept). Written once as data, it gives us:
//   - TypeScript interfaces for shells/components  (toTs)
//   - a coarse kind per prop for checking real components (coarseKind)
//   - readable docs                                   (toDocType)
//
// Helpers keep the catalogue short:  str("Title", { required: true })

const base = (type, description, extra = {}) => ({ type, description, required: false, ...extra });

export const str = (description, o) => base("string", description, o); // one line of text
export const text = (description, o) => base("text", description, o); // long / multi-line text
export const num = (description, o) => base("number", description, o);
export const bool = (description, o) => base("boolean", description, o);
export const url = (description, o) => base("url", description, o);
export const image = (description, o) => base("image", description, o); // image URL
export const icon = (description, o) => base("icon", description, o); // lucide-react icon name
export const date = (description, o) => base("date", description, o); // ISO date string
export const node = (description, o) => base("node", description, o); // ReactNode (children)
export const record = (description, o) => base("record", description, o); // Record<string, unknown>
export const anyValue = (description, o) => base("unknown", description, o); // value of any type
export const oneOf = (values, description, o) => base("enum", description, { values, ...o });
export const list = (of, description, o) => base("array", description, { of, ...o });
export const shape = (name, description, o) => base("shape", description, { name, ...o });
export const fn = (signature, description, o) => base("callback", description, { signature, ...o });

export const required = (spec) => ({ ...spec, required: true });

const STRINGY = new Set(["string", "text", "url", "image", "icon", "date"]);

/** Coarse kind used when comparing a real component's props with a contract. */
export function coarseKind(spec) {
  if (STRINGY.has(spec.type) || spec.type === "enum") return "string";
  if (spec.type === "number") return "number";
  if (spec.type === "boolean") return "boolean";
  if (spec.type === "array") return "array";
  if (spec.type === "shape" || spec.type === "record") return "object";
  if (spec.type === "callback") return "function";
  if (spec.type === "node") return "node";
  if (spec.type === "unknown") return "any";
  throw new Error(`unknown prop type: ${spec.type}`);
}

/** TypeScript type text for one prop spec. */
export function toTs(spec) {
  switch (spec.type) {
    case "string":
    case "text":
    case "url":
    case "image":
    case "icon":
    case "date":
      return "string";
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "node":
      return "ReactNode";
    case "record":
      return "Record<string, unknown>";
    case "unknown":
      return "unknown";
    case "enum":
      return spec.values.map((v) => JSON.stringify(v)).join(" | ");
    case "array": {
      const inner = toTs(spec.of);
      return /[|&]/.test(inner) ? `Array<${inner}>` : `${inner}[]`;
    }
    case "shape":
      return spec.name;
    case "callback":
      return spec.signature; // e.g. "(email: string, password: string) => Promise<void>"
    default:
      throw new Error(`unknown prop type: ${spec.type}`);
  }
}

/** Short human-readable type for docs. */
export function toDocType(spec) {
  switch (spec.type) {
    case "enum":
      return spec.values.join(" / ");
    case "array":
      return `list of ${toDocType(spec.of)}`;
    case "shape":
      return spec.name;
    case "callback":
      return `function ${spec.signature}`;
    case "unknown":
      return "any value";
    default:
      return spec.type;
  }
}

/** Every shape name referenced anywhere inside a spec (for validation). */
export function referencedShapes(spec, out = new Set()) {
  if (spec.type === "shape") out.add(spec.name);
  if (spec.type === "array") referencedShapes(spec.of, out);
  return out;
}
