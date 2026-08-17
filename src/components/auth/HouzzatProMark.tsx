import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * White house + agent mark only (Pro launcher foreground, no gradient plate).
 * Asset: /images/houzzat-pro-mark.png ← mobile/resources-pro/icon-foreground.png
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
    <Image
      src="/images/houzzat-pro-mark.png"
      alt={title}
      width={size}
      height={size}
      priority
      className={cn("drop-shadow-sm", className)}
    />
  );
}
