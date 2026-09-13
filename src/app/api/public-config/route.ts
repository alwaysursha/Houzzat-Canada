import { NextResponse } from "next/server";
import { resolveWhatsAppNumberForRequest } from "@/lib/tenancy/resolve-tenant-whatsapp";

/** Public contact config available at Worker runtime (not only build-time). */
export async function GET(request: Request) {
  const whatsappExpert = await resolveWhatsAppNumberForRequest(request);
  return NextResponse.json(
    { whatsappExpert },
    {
      headers: {
        "Cache-Control": "private, no-store",
      },
    },
  );
}
