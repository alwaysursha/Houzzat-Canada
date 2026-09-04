/** Stage 6.10A — owner activation action errors. */

export class OwnerActivationError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, code: string, status = 400) {
    super(message);
    this.name = "OwnerActivationError";
    this.code = code;
    this.status = status;
  }
}
