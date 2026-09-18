/**
 * @file sql.ts
 * @description Small D1/SQLite helpers shared by the Worker routes.
 */

/** `?, ?, ?` — placeholders for an `IN (...)` list built from a runtime length. */
export function placeholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(', ');
}

/**
 * SQLite (and therefore D1) reports constraint violations as plain errors, so
 * routes match on the message to map them onto a 409 instead of a 500.
 */
export function isConstraintViolation(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /UNIQUE constraint failed|FOREIGN KEY constraint failed|CHECK constraint failed/i.test(
    message,
  );
}
