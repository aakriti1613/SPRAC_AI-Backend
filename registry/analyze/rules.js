// Static safety/consistency rules for component source (no code is executed).
//   fixed-colour  : hex/rgb/hsl literals or Tailwind palette colours instead of theme tokens
//   network       : components must not fetch data themselves (the shell does)
//   raw-html      : dangerouslySetInnerHTML (XSS risk)
//   eval          : eval / new Function
import crypto from "node:crypto";
import ts from "typescript";

const PALETTE = "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const COLOUR_UTIL = "bg|text|border|ring|fill|stroke|from|to|via|outline|shadow|decoration|accent|caret|divide|placeholder";
const PALETTE_CLASS = new RegExp(`^(?:[a-z-]+:)*(?:${COLOUR_UTIL})-(?:${PALETTE})-\\d{2,3}(?:/\\d+)?$`);
const ARBITRARY_COLOUR = new RegExp(`^(?:[a-z-]+:)*(?:${COLOUR_UTIL})-\\[(?:#|rgb|hsl)`);
const COLOUR_VALUE = /^(?:#[0-9a-f]{3,8}|(?:rgb|rgba|hsl|hsla)\(.*\))$/i;
const NETWORK_PACKAGES = new Set(["axios", "@supabase/supabase-js", "firebase", "ky", "superagent", "graphql-request", "@apollo/client"]);
const NETWORK_GLOBALS = new Set(["fetch", "XMLHttpRequest", "WebSocket", "EventSource"]);

function lineOf(sf, pos) {
  return sf.getLineAndCharacterOfPosition(pos).line + 1;
}

/**
 * Lines that carry an explicit, reviewed exception:
 *   // sparc-allow fixed-colour: <reason>
 * on the same line or the line above. Exceptions are reported (not hidden).
 */
function allowances(sourceText) {
  const out = new Map(); // line -> { rule, reason }
  sourceText.split(/\r?\n/).forEach((line, i) => {
    const m = /sparc-allow\s+([a-z-]+)\s*:\s*(.+?)\s*(?:\*\/|$)/.exec(line);
    if (!m) return;
    out.set(i + 1, { rule: m[1], reason: m[2] });
    out.set(i + 2, { rule: m[1], reason: m[2] });
  });
  return out;
}

/** Run all rules on one file. Returns [{ rule, message, file, line }]. */
export function checkSource(fileName, sourceText, { allowed = [] } = {}) {
  const sf = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const issues = [];
  const allow = allowances(sourceText);
  const add = (rule, message, node) => {
    const line = lineOf(sf, node.getStart(sf));
    const a = allow.get(line);
    if (a && a.rule === rule) {
      allowed.push({ rule, reason: a.reason, file: fileName, line });
      return;
    }
    issues.push({ rule, message, file: fileName, line });
  };

  /** "#add" as a link target or id is not a colour. */
  const isLinkOrId = (node) => {
    const p = node.parent;
    const name = p && (ts.isJsxAttribute(p) || ts.isPropertyAssignment(p)) ? p.name.getText(sf) : "";
    return ["href", "to", "id", "key", "hash"].includes(name);
  };

  const checkLiteral = (text, node) => {
    if (COLOUR_VALUE.test(text.trim()) && !isLinkOrId(node)) return add("fixed-colour", `fixed colour value "${text.trim()}" (use theme tokens)`, node);
    for (const token of text.split(/\s+/)) {
      if (PALETTE_CLASS.test(token) || ARBITRARY_COLOUR.test(token)) add("fixed-colour", `fixed colour class "${token}" (use theme tokens like bg-primary)`, node);
    }
  };

  const visit = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) checkLiteral(node.text, node);
    else if (ts.isTemplateExpression(node)) {
      checkLiteral(node.head.text, node);
      for (const span of node.templateSpans) checkLiteral(span.literal.text, node);
    } else if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const spec = node.moduleSpecifier.text;
      const pkg = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
      if (NETWORK_PACKAGES.has(pkg)) add("network", `imports "${pkg}" (data must come from the shell)`, node);
    } else if ((ts.isCallExpression(node) || ts.isNewExpression(node)) && ts.isIdentifier(node.expression)) {
      const name = node.expression.text;
      if (NETWORK_GLOBALS.has(name)) add("network", `calls ${name}() (data must come from the shell)`, node);
      if (name === "eval" || (ts.isNewExpression(node) && name === "Function")) add("eval", `uses ${name} (unsafe)`, node);
    } else if (ts.isJsxAttribute(node) && node.name.getText(sf) === "dangerouslySetInnerHTML") {
      add("raw-html", "uses dangerouslySetInnerHTML (XSS risk)", node);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return issues;
}

/** sha256 over files (sorted by path, line endings normalised so Windows/Linux agree). */
export function contentHash(files) {
  const h = crypto.createHash("sha256");
  for (const f of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    h.update(f.path);
    h.update("\0");
    h.update(f.content.replace(/\r\n/g, "\n"));
    h.update("\0");
  }
  return h.digest("hex");
}
