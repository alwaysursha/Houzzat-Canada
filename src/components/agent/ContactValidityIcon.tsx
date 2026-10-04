import { CircleCheck, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

/** Shared Leads desk / Lead Profile contact validity treatment. */
export function ContactValidityIcon({
  verified,
  className,
}: {
  verified: boolean;
  className?: string;
}) {
  if (verified) {
    return (
      <CircleCheck
        className={cn("size-3.5 text-[#6a9e7d]", className)}
        strokeWidth={2}
      />
    );
  }
  return (
    <TriangleAlert
      className={cn("size-3.5 text-[#d4a574]", className)}
      strokeWidth={2}
    />
  );
}
