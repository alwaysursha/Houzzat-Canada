/** Stage 6.9 — provisioning action errors for Master Admin API. */

export class ProvisioningActionError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, code: string, status = 400) {
    super(message);
    this.name = "ProvisioningActionError";
    this.code = code;
    this.status = status;
  }
}
