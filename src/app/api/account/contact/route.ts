import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireCustomerUser } from "@/lib/account";
import { scheduleStaffContactUpdatedNotice } from "@/lib/account/contact-update-notify";
import { logContactActivityForCustomer } from "@/lib/agent/log-contact-activity";
import { isDatabaseUnavailableError } from "@/lib/errors";
import {
  createRequestId,
  exceptionLogFields,
  jsonApiResponse,
  logJsonApi,
} from "@/lib/http/json-api-response";
import { prisma } from "@/lib/prisma";

const ROUTE = "/api/account/contact";

const schema = z
  .object({
    email: z.string().trim().email().max(200).optional(),
    phone: z
      .string()
      .trim()
      .max(40)
      .optional()
      .transform((v) => (v === undefined ? undefined : v || null)),
  })
  .refine((v) => v.email !== undefined || v.phone !== undefined, {
    message: "Provide email and/or phone",
  });

export async function PATCH(request: Request) {
  const requestId = createRequestId();
  const startedAt = Date.now();

  const reply = (status: number, body: unknown, error?: unknown) => {
    try {
      logJsonApi({
        requestId,
        route: ROUTE,
        method: "PATCH",
        status,
        durationMs: Date.now() - startedAt,
        ...exceptionLogFields(error),
      });
    } catch {
      // Logging must never replace a JSON response.
    }
    return jsonApiResponse(body, { status, requestId });
  };

  try {
    let user;
    try {
      user = await requireCustomerUser();
    } catch (error) {
      if (isDatabaseUnavailableError(error)) {
        return reply(503, { error: "Could not save contact info" }, error);
      }
      throw error;
    }
    if (!user) {
      return reply(401, { error: "Sign in required." });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch (error) {
      return reply(400, { error: "Invalid payload" }, error);
    }

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return reply(400, { error: "Invalid payload" });
    }

    const nextEmail =
      parsed.data.email !== undefined
        ? parsed.data.email.toLowerCase()
        : undefined;
    const nextPhone = parsed.data.phone;

    if (nextEmail && nextEmail !== user.email) {
      const taken = await prisma.user.findUnique({
        where: { email: nextEmail },
        select: { id: true },
      });
      if (taken && taken.id !== user.id) {
        return reply(409, { error: "That email is already in use." });
      }
    }

    const current = await prisma.user.findUnique({
      where: { id: user.id },
      select: { email: true, phone: true },
    });
    if (!current) {
      return reply(404, { error: "Not found" });
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        ...(nextEmail !== undefined
          ? {
              email: nextEmail,
              emailUpdateRequestedAt: null,
              ...(nextEmail !== current.email ? { emailVerified: null } : {}),
            }
          : {}),
        ...(nextPhone !== undefined
          ? {
              phone: nextPhone,
              phoneUpdateRequestedAt: null,
              ...(nextPhone !== current.phone ? { phoneVerifiedAt: null } : {}),
            }
          : {}),
      },
      select: {
        email: true,
        phone: true,
        emailUpdateRequestedAt: true,
        phoneUpdateRequestedAt: true,
      },
    });

    const changes: string[] = [];
    if (nextEmail !== undefined && nextEmail !== current.email) {
      changes.push(`email → ${nextEmail}`);
    }
    if (nextPhone !== undefined && nextPhone !== current.phone) {
      changes.push(nextPhone ? `phone → ${nextPhone}` : "phone cleared");
    }

    if (changes.length) {
      try {
        await logContactActivityForCustomer({
          customerId: user.id,
          type: "contact_updated_by_customer",
          body: `Customer updated contact: ${changes.join("; ")}`,
          actorUserId: user.id,
          meta: {
            email: updated.email,
            phone: updated.phone,
            changes,
          },
        });
      } catch (error) {
        try {
          logJsonApi({
            requestId,
            route: ROUTE,
            method: "PATCH",
            status: 200,
            durationMs: Date.now() - startedAt,
            event: "activity_log_failed",
            ...exceptionLogFields(error),
          });
        } catch {
          // Logging must never replace a JSON response.
        }
      }
    }

    scheduleStaffContactUpdatedNotice({
      customerId: user.id,
      emailChanged: changes.some((c) => c.startsWith("email")),
      phoneChanged: changes.some((c) => c.startsWith("phone")),
    });

    return reply(200, {
      ok: true,
      email: updated.email,
      phone: updated.phone,
      needPhone:
        !updated.phone?.trim() || updated.phoneUpdateRequestedAt != null,
      needEmail: updated.emailUpdateRequestedAt != null,
    });
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return reply(503, { error: "Could not save contact info" }, error);
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return reply(409, { error: "That email is already in use." }, error);
    }
    return reply(500, { error: "Could not save contact info" }, error);
  }
}
