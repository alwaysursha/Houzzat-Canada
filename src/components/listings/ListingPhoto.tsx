"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

type ListingPhotoProps = {
  src: string;
  alt: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
  quality?: number;
  draggable?: boolean;
} & (
  | { fill: true; width?: never; height?: never }
  | { fill?: false; width: number; height: number }
);

/**
 * MLS / AMPRE photo hosts vary. next/image remotePatterns often block them;
 * use a plain <img> for non-Unsplash hosts so cards and galleries still show.
 */
export function ListingPhoto({
  src,
  alt,
  fill,
  width,
  height,
  className,
  sizes,
  priority,
  quality,
  draggable,
}: ListingPhotoProps) {
  const useNextImage =
    src.includes("images.unsplash.com") || src.startsWith("/");

  if (!useNextImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- AMPRE CDN hosts are dynamic
      <img
        src={src}
        alt={alt}
        width={fill ? undefined : width}
        height={fill ? undefined : height}
        className={cn(fill && "absolute inset-0 size-full", className)}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        referrerPolicy="no-referrer"
        draggable={draggable}
        sizes={sizes}
      />
    );
  }

  if (fill) {
    return (
      <Image
        src={src}
        alt={alt}
        fill
        className={className}
        sizes={sizes}
        priority={priority}
        quality={quality}
        draggable={draggable}
      />
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      className={className}
      sizes={sizes}
      priority={priority}
      quality={quality}
      draggable={draggable}
    />
  );
}
