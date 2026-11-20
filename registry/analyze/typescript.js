// Reads React component source with the TypeScript compiler (never runs it).
// For each entry file it finds:
//   - props of the default-exported component (name, coarse kind, required)
//   - `export const fieldTypes = [...]` (form-field components)
//   - imports (npm packages, shared helpers, local files)
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

/** Create a TypeScript program for a project (uses its tsconfig for paths/aliases). */
export function createProgram(projectDir, entryFiles, tsconfigName = "tsconfig.json") {
  const configPath = path.join(projectDir, tsconfigName);
  let options = { jsx: ts.JsxEmit.ReactJSX, strict: true, skipLibCheck: true, noEmit: true, allowJs: true };
  if (fs.existsSync(configPath)) {
    const raw = ts.readConfigFile(configPath, ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(raw.config ?? {}, ts.sys, projectDir);
    options = { ...parsed.options, noEmit: true, skipLibCheck: true };
  }
  return ts.createProgram(entryFiles, options);
}

const STRINGY = ts.TypeFlags.StringLike;
const NUMBERY = ts.TypeFlags.NumberLike;
const BOOLY = ts.TypeFlags.BooleanLike;

/** Map a TypeScript type to the coarse kinds used by contracts (see sparc/schema.js). */
export function coarseKindOf(checker, type) {
  // Check any/unknown first: NonNullable<unknown> would turn into `{}` (an object).
  if (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return "unknown";
  const t = checker.getNonNullableType(type);
  // Functions first: `(f) => ReactNode` mentions ReactNode but is a function.
  if (t.getCallSignatures().length > 0) return "function";
  const text = checker.typeToString(t);
  if (t.aliasSymbol?.name === "ReactNode" || /\bReactNode\b|\bReactElement\b|JSX\.Element/.test(text)) return "node";
  if (t.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return "unknown";
  const parts = t.isUnion() ? t.types : [t];
  if (parts.every((p) => p.flags & STRINGY)) return "string";
  if (parts.every((p) => p.flags & NUMBERY)) return "number";
  if (parts.every((p) => p.flags & BOOLY)) return "boolean";
  if (parts.length === 1 && (checker.isArrayType(t) || checker.isTupleType(t))) return "array";
  if (parts.length === 1 && t.flags & ts.TypeFlags.Object) return "object";
  return "unknown";
}

/**
 * The component a file exports: the default export, else a named export with
 * the file's name (StatCard.tsx -> StatCard), else the first PascalCase export.
 */
function componentExportType(checker, sourceFile) {
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
  if (!moduleSymbol) return null;
  const exports = checker.getExportsOfModule(moduleSymbol);
  const base = sourceFile.fileName.split(/[\\/]/).pop().replace(/\.[jt]sx?$/, "");
  const pascal = base.replace(/(^|[-_])([a-z0-9])/g, (_, __, c) => c.toUpperCase());
  let symbol =
    exports.find((s) => s.escapedName === "default") ??
    exports.find((s) => s.escapedName === base || s.escapedName === pascal) ??
    exports.find((s) => /^[A-Z]/.test(String(s.escapedName)));
  if (!symbol) return null;
  if (symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
  const decl = symbol.valueDeclaration ?? symbol.declarations?.[0];
  if (!decl) return null;
  return checker.getTypeOfSymbolAtLocation(symbol, decl);
}

/** Props of the default export, keeping only props declared inside the project (not node_modules). */
export function extractProps(program, file) {
  const checker = program.getTypeChecker();
  const sf = program.getSourceFile(file);
  if (!sf) return { props: [], found: false };
  const fnType = componentExportType(checker, sf);
  const signature = fnType?.getCallSignatures()[0];
  if (!signature) return { props: [], found: false };
  const param = signature.getParameters()[0];
  if (!param) return { props: [], found: true };
  const paramType = checker.getTypeOfSymbolAtLocation(param, sf);
  const props = [];
  for (const prop of checker.getPropertiesOfType(paramType)) {
    const decls = prop.declarations ?? [];
    if (decls.length && decls.every((d) => d.getSourceFile().fileName.includes("node_modules"))) continue;
    const propType = checker.getTypeOfSymbolAtLocation(prop, sf);
    props.push({
      name: prop.getName(),
      kind: coarseKindOf(checker, propType),
      required: !(prop.flags & ts.SymbolFlags.Optional),
    });
  }
  props.sort((a, b) => a.name.localeCompare(b.name));
  return { props, found: true };
}

/** `export const fieldTypes = ["text", ...] as const` -> ["text", ...] */
export function extractStringArrayExport(sourceText, exportName) {
  const sf = ts.createSourceFile("x.tsx", sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  for (const stmt of sf.statements) {
    if (!ts.isVariableStatement(stmt) || !stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
    for (const d of stmt.declarationList.declarations) {
      if (d.name.getText(sf) !== exportName || !d.initializer) continue;
      let init = d.initializer;
      while (ts.isAsExpression(init) || ts.isSatisfiesExpression?.(init)) init = init.expression;
      if (ts.isArrayLiteralExpression(init)) {
        return init.elements.filter(ts.isStringLiteralLike).map((e) => e.text);
      }
    }
  }
  return null;
}

/** All import specifiers of a source text. */
export function importsOf(sourceText) {
  const sf = ts.createSourceFile("x.tsx", sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out = [];
  for (const stmt of sf.statements) {
    if ((ts.isImportDeclaration(stmt) || ts.isExportDeclaration(stmt)) && stmt.moduleSpecifier && ts.isStringLiteral(stmt.moduleSpecifier)) {
      const typeOnly = ts.isImportDeclaration(stmt) ? Boolean(stmt.importClause?.isTypeOnly) : Boolean(stmt.isTypeOnly);
      out.push({ specifier: stmt.moduleSpecifier.text, typeOnly });
    }
  }
  return out;
}

/** npm package name from a bare specifier ("@scope/pkg/sub" -> "@scope/pkg"). */
export function packageName(specifier) {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

const EXTENSIONS = [".tsx", ".ts", ".jsx", ".js"];

/** Resolve a relative import to a file on disk (or null). */
export function resolveLocal(fromFile, specifier) {
  const base = path.resolve(path.dirname(fromFile), specifier);
  for (const candidate of [base, ...EXTENSIONS.map((e) => base + e), ...EXTENSIONS.map((e) => path.join(base, `index${e}`))]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}
