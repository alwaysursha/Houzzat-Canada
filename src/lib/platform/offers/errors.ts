export class CommercialOfferActionError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, code: string, status = 400) {
    super(message);
    this.name = "CommercialOfferActionError";
    this.status = status;
    this.code = code;
  }
}
