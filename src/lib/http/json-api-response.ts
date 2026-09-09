import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import {
  HOUZZAT_REQUEST_ID_HEADER,
  PRIVATE_NO_STORE,
} from "@/lib/http/api-headers";

export function createRequestId(): string {
  return crypto.randomUUID();
}

export function jsonApiResponse(
  body: unknown,
  init: { status?: number; requestId: string },
): NextResponse {
  return NextResponse.json(body, {
    status: init.status ?? 200,
    headers: {
      "Cache-Control": PRIVATE_NO_STORE,
      [HOUZZAT_REQUEST_ID_HEADER]: init.requestId,
    },
  });
}

const PRISMA_CODE = /^P\d{4}$/;

export function exceptionLogFields(error: unknown): {
  errorName?: string;
  errorCode?: string;
} {
  if (error == null) return {};

  const errorName = error instanceof Error ? error.name : "Error";
  const fields: { errorName: string; errorCode?: string } = { errorName };

  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    PRISMA_CODE.test(error.code)
  ) {
    fields.errorCode = error.code;
  }

  return fields;
}

export function logJsonApi(fields: {
  requestId: string;
  route: string;
  method: string;
  status: number;
  durationMs: number;
  jsonBytes?: number;
  event?: string;
  errorName?: string;
  errorCode?: string;
}): void {
  const parts = [
    `[${fields.route}]`,
    fields.method,
    `id=${fields.requestId}`,
    `status=${fields.status}`,
    `ms=${fields.durationMs}`,
  ];
  if (fields.event) {
    parts.push(`event=${fields.event}`);
  }
  if (fields.jsonBytes != null) {
    parts.push(`bytes=${fields.jsonBytes}`);
  }
  if (fields.errorName) {
    parts.push(`err=${fields.errorName}`);
  }
  if (fields.errorCode) {
    parts.push(`code=${fields.errorCode}`);
  }
  console.info(parts.join(" "));
}
