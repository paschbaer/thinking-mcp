/** Closed-namespace template resolver (R6, FR-041 preparation fail-closed). */
export class TemplateError extends Error {
  constructor(message: string) {
    super(`template_error: ${message}`);
    this.name = "TemplateError";
  }
}

export type TemplateContext = Record<string, unknown>;

const REF = /^\$\{([^}]+)\}$/;
const REF_IN_STRING = /\$\{([^}]+)\}/g;
const VALID_PATH = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/;

function lookup(ctx: TemplateContext, path: string): unknown {
  if (!VALID_PATH.test(path)) {
    // Malformed/injection-shaped template references fail closed (never evaluated).
    throw new TemplateError(`invalid template variable syntax: ${path}`);
  }
  const segments = path.split(".");
  let current: unknown = ctx;
  for (const seg of segments) {
    if (
      current === null ||
      typeof current !== "object" ||
      !Object.hasOwn(current as Record<string, unknown>, seg)
    ) {
      throw new TemplateError(`unknown template variable: ${path}`);
    }
    current = (current as Record<string, unknown>)[seg];
  }
  return current;
}

export function resolveTemplate(node: unknown, ctx: TemplateContext): unknown {
  if (typeof node === "string") {
    const exact = node.match(REF);
    if (exact) return lookup(ctx, exact[1]!);
    return node.replace(REF_IN_STRING, (_m, path: string) => {
      const value = lookup(ctx, path);
      if (typeof value === "string") return value;
      if (value === null || value === undefined) return "";
      return JSON.stringify(value);
    });
  }
  if (Array.isArray(node)) return node.map((item) => resolveTemplate(item, ctx));
  if (node !== null && typeof node === "object") {
    return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, resolveTemplate(v, ctx)]));
  }
  return node;
}
