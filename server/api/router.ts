import { apiOperations } from "../../shared/api-contract.js";

import type { ApiMethod } from "../../shared/api-contract.js";

type Operation = (typeof apiOperations)[number];
const compiled = apiOperations
  .map((operation) => ({
    operation,
    pattern: new RegExp(
      `^${operation.path
        .split("/")
        .map((segment) => {
          const parameter = /^\{(\w+)\}$/.exec(segment);
          return parameter
            ? `(?<${parameter[1]}>[^/]+)`
            : segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        })
        .join("/")}$`,
    ),
    parameterCount: (operation.path.match(/\{/g) ?? []).length,
  }))
  .sort((a, b) => a.parameterCount - b.parameterCount);

export function matchOperation(method: string | undefined, path: string) {
  for (const { operation, pattern } of compiled) {
    if (operation.method !== method) continue;
    const match = pattern.exec(path);
    if (match) return { operation, params: { ...match.groups } as Record<string, string> };
  }
  return null;
}

/** Also identify a known path for a correct, authenticated 405 response. */
export function matchPath(path: string): { operation: Operation; methods: ApiMethod[] } | null {
  const matches = compiled.filter((route) => route.pattern.test(path));
  const first = matches[0];
  if (!first) return null;
  // Literal actions take precedence over parameter routes even for wrong methods.
  const methods = matches
    .filter((route) => route.operation.path === first.operation.path)
    .map((route) => route.operation.method);
  return { operation: first.operation, methods };
}

/** Vercel rewrite query takes precedence; normalize slashes like the legacy router. */
export function requestPath(req: { query: Record<string, unknown>; url?: string }) {
  const rewrite = req.query.path;
  const source = Array.isArray(rewrite)
    ? rewrite.join("/")
    : typeof rewrite === "string"
      ? rewrite
      : ((req.url ?? "").split("?")[0] ?? "");
  const segments = source.split("/").filter(Boolean);
  if (segments[0] === "api") segments.shift();
  return `/api/${segments.join("/")}`;
}
