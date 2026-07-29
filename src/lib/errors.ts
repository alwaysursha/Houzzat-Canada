/** Thrown when Neon/Prisma is unreachable — do not treat as “user missing”. */
export class DatabaseUnavailableError extends Error {
  constructor(message = "Database temporarily unavailable") {
    super(message);
    this.name = "DatabaseUnavailableError";
  }
}

export function isDatabaseUnavailableError(
  error: unknown,
): error is DatabaseUnavailableError {
  return (
    error instanceof DatabaseUnavailableError ||
    (typeof error === "object" &&
      error !== null &&
      "name" in error &&
      (error as { name: string }).name === "DatabaseUnavailableError")
  );
}
