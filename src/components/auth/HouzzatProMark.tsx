import { HOUZZAT_PRO_MARK_DATA_URI } from "@/components/auth/houzzat-pro-mark-data";
import { cn } from "@/lib/utils";

/**
 * White house + agent mark only (Pro launcher foreground, no gradient plate).
 * Inlined data URI ensures synchronous 0ms paint with zero flashing or network latency across hosts.
 */
export function HouzzatProMark({
  className,
  title = "HouzzatPro",
  size = 72,
}: {
  className?: string;
  title?: string;
  size?: number;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={HOUZZAT_PRO_MARK_DATA_URI}
      alt={title}
      width={size}
      height={size}
      className={cn("drop-shadow-sm select-none pointer-events-none", className)}
      style={{ width: size, height: size }}
    />
  );
}
