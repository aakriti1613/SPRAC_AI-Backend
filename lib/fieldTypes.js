// THE single list of field types the platform supports.
//
// Every other list (portal config validation, SQL column types, which types
// need options) is derived from this one. Copies that have to live inside the
// templates (they ship as standalone projects) are checked against this list by
// test/fieldTypes.test.js, so they can't silently drift apart.
//
//   type        - name used in portal-config.json
//   sql         - Postgres column type created by lib/schemaGenerator.js
//   hasOptions  - field needs an `options` list (select-like)
export const FIELD_TYPES = Object.freeze([
  { type: "text", sql: "TEXT", hasOptions: false },
  { type: "email", sql: "TEXT", hasOptions: false },
  { type: "password", sql: "TEXT", hasOptions: false },
  { type: "phone", sql: "TEXT", hasOptions: false },
  { type: "url", sql: "TEXT", hasOptions: false },
  { type: "textarea", sql: "TEXT", hasOptions: false },
  { type: "number", sql: "NUMERIC", hasOptions: false },
  { type: "currency", sql: "NUMERIC", hasOptions: false },
  { type: "percentage", sql: "NUMERIC", hasOptions: false },
  { type: "rating", sql: "NUMERIC", hasOptions: false },
  { type: "select", sql: "TEXT", hasOptions: true },
  { type: "multi-select", sql: "TEXT[]", hasOptions: true },
  { type: "checkbox", sql: "BOOLEAN", hasOptions: false },
  { type: "checkbox-group", sql: "TEXT[]", hasOptions: true },
  { type: "toggle", sql: "BOOLEAN", hasOptions: false },
  { type: "radio", sql: "TEXT", hasOptions: true },
  { type: "date", sql: "DATE", hasOptions: false },
  { type: "time", sql: "TIME", hasOptions: false },
  { type: "datetime", sql: "TIMESTAMPTZ", hasOptions: false },
  { type: "file", sql: "TEXT", hasOptions: false },
  { type: "image", sql: "TEXT", hasOptions: false },
  { type: "avatar", sql: "TEXT", hasOptions: false },
  { type: "tags", sql: "TEXT[]", hasOptions: false },
  { type: "color", sql: "TEXT", hasOptions: false },
  { type: "address", sql: "JSONB", hasOptions: false },
  { type: "json", sql: "JSONB", hasOptions: false },
  { type: "reference", sql: "UUID", hasOptions: false },
]);

export const FIELD_TYPE_NAMES = Object.freeze(FIELD_TYPES.map((t) => t.type));

export const FIELD_TYPE_SQL = Object.freeze(
  Object.fromEntries(FIELD_TYPES.map((t) => [t.type, t.sql]))
);

export const OPTION_FIELD_TYPE_NAMES = Object.freeze(
  FIELD_TYPES.filter((t) => t.hasOptions).map((t) => t.type)
);
