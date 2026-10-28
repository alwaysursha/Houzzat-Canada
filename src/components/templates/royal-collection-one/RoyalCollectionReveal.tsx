"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./royal-collection.module.css";

export function RoyalCollectionReveal({
  children,
  className,
  early = false,
}: {
  children: ReactNode;
  className?: string;
  /** Fade as the block nears the screen. A tall section otherwise waits until a slice of it is already in view. */
  early?: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setShown(true);
      },
      early ? { threshold: 0, rootMargin: "0px 0px 10% 0px" } : { threshold: 0.16 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [early]);

  return (
    <div
      ref={ref}
      className={[styles.reveal, shown ? styles.revealOn : "", className]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}
