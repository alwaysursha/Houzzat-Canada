export class SmsQuickTextActionError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, code: string, status = 400) {
    super(message);
    this.name = "SmsQuickTextActionError";
    this.status = status;
    this.code = code;
  }
}
