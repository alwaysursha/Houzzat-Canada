import { NextResponse } from "next/server";
import { getExpertWhatsAppNumber } from "@/lib/whatsapp";

/** Public contact config available at Worker runtime (not only build-time). */
export async function GET() {
  return NextResponse.json({
    whatsappExpert: getExpertWhatsAppNumber(),
  });
}
