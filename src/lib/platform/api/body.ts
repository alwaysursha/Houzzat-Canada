import { PlatformApiError } from "@/lib/platform/api/handler";

export async function readPlatformJsonBody<T extends Record<string, unknown>>(
  request: Request,
): Promise<T> {
  const text = await request.text();
  if (!text.trim()) {
    return {} as T;
  }

  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new PlatformApiError("Invalid JSON body", 400, "INVALID_BODY");
    }
    return parsed as T;
  } catch (error) {
    if (error instanceof PlatformApiError) {
      throw error;
    }
    throw new PlatformApiError("Invalid JSON body", 400, "INVALID_BODY");
  }
}
