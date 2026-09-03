import { NextResponse } from "next/server";
import {
  toPlatformHttpError,
  withPlatformOperator,
} from "@/lib/platform/api/handler";
import { platformOk } from "@/lib/platform/api/response";

export const platformRuntime = "nodejs";

export async function runPlatformRoute<T>(
  handler: () => Promise<T>,
): Promise<NextResponse> {
  try {
    const data = await withPlatformOperator(async () => handler());
    return platformOk(data);
  } catch (error) {
    return toPlatformHttpError(error);
  }
}

export async function runPlatformRouteWithOperator<T>(
  handler: Parameters<typeof withPlatformOperator<T>>[0],
): Promise<NextResponse> {
  try {
    const data = await withPlatformOperator(handler);
    return platformOk(data);
  } catch (error) {
    return toPlatformHttpError(error);
  }
}
