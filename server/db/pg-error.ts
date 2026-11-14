/** Only structured PostgreSQL metadata; never return query text or parameters. */
export function pgErrorDetails(error: unknown): { code?: string; constraint?: string } {
  const seen = new Set<object>();
  let current = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const candidate = current as { code?: unknown; constraint?: unknown; cause?: unknown };
    if (typeof candidate.code === "string" && /^[0-9A-Z]{5}$/.test(candidate.code)) {
      return {
        code: candidate.code,
        ...(typeof candidate.constraint === "string" ? { constraint: candidate.constraint } : {}),
      };
    }
    current = candidate.cause;
  }
  return {};
}

export function isPgError(error: unknown, code: string) {
  return pgErrorDetails(error).code === code;
}
