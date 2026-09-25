/** Temporary Android 16 back-path logs. Filter logcat for this prefix. */
export const ANDROID_BACK_TRACE = "HOUZZAT_BACK_TRACE";

export function traceAndroidBack(
  step: string,
  detail?: Record<string, unknown>,
): void {
  let extra = "";
  if (detail) {
    try {
      extra = ` ${JSON.stringify(detail)}`;
    } catch {
      extra = " [unserializable]";
    }
  }
  console.log(`${ANDROID_BACK_TRACE} ${step}${extra}`);
}
