"use client";

import { useEffect, useRef, type ReactNode } from "react";
import "./home-preview-motion.css";

const REDUCE_MOTION = "(prefers-reduced-motion: reduce)";
const FINE_POINTER = "(hover: hover) and (pointer: fine)";
const WATCH = "[data-hp-reveal], [data-hp-draw], [data-hp-watch]";

function remember(seen: WeakSet<Element>, observer: IntersectionObserver, node: Element) {
  if (seen.has(node)) return;
  if (!node.matches(WATCH)) return;
  seen.add(node);
  observer.observe(node);
}

function watchTree(seen: WeakSet<Element>, observer: IntersectionObserver, node: Element) {
  remember(seen, observer, node);
  node.querySelectorAll(WATCH).forEach((child) => remember(seen, observer, child));
}

export function HomePreviewMotion({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const reduceMotion = window.matchMedia(REDUCE_MOTION).matches;
    const html = document.documentElement;
    const previousScroll = html.style.scrollBehavior;
    if (!reduceMotion) html.style.scrollBehavior = "smooth";

    const seen = new WeakSet<Element>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-in");
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0, rootMargin: "40px 0px 12% 0px" },
    );

    root.querySelectorAll(WATCH).forEach((node) => remember(seen, observer, node));
    const mutations = new MutationObserver((records) => {
      for (const record of records) {
        record.addedNodes.forEach((node) => {
          if (node instanceof Element) watchTree(seen, observer, node);
        });
      }
    });
    mutations.observe(root, { childList: true, subtree: true });

    let frame = 0;
    let lastY = window.scrollY;
    const settle = (passedOnly: boolean) => {
      const limit = window.innerHeight + 24;
      root.querySelectorAll(`${WATCH}, [data-hp-enter]`).forEach((node) => {
        if (node.classList.contains("is-settled")) return;
        const rect = node.getBoundingClientRect();
        const passed = rect.bottom < 8;
        const entering = rect.top < limit && rect.bottom > 0;
        if (!passed && (passedOnly || !entering)) return;
        node.classList.add("is-in", "is-settled");
        observer.unobserve(node);
      });
    };
    const onScroll = () => {
      if (reduceMotion) return;
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const y = window.scrollY;
        const rush = Math.abs(y - lastY) > 36;
        lastY = y;
        if (rush) settle(false);
        else settle(true);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    const cleanTilt: Array<() => void> = [];
    if (!reduceMotion && window.matchMedia(FINE_POINTER).matches) {
      root.querySelectorAll<HTMLElement>("[data-hp-tilt]").forEach((tilt) => {
        const move = (event: PointerEvent) => {
          const rect = tilt.getBoundingClientRect();
          if (rect.width < 1 || rect.height < 1) return;
          const px = (event.clientX - rect.left) / rect.width - 0.5;
          const py = (event.clientY - rect.top) / rect.height - 0.5;
          tilt.style.setProperty("--hp-ry", `${(px * 1.2).toFixed(2)}deg`);
          tilt.style.setProperty("--hp-rx", `${(-py * 1.2).toFixed(2)}deg`);
          tilt.classList.add("is-tilting");
        };
        const leave = () => {
          tilt.classList.remove("is-tilting");
          tilt.style.removeProperty("--hp-rx");
          tilt.style.removeProperty("--hp-ry");
        };
        tilt.addEventListener("pointermove", move, { passive: true });
        tilt.addEventListener("pointerleave", leave);
        cleanTilt.push(() => {
          tilt.removeEventListener("pointermove", move);
          tilt.removeEventListener("pointerleave", leave);
        });
      });
    }

    return () => {
      html.style.scrollBehavior = previousScroll;
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
      observer.disconnect();
      mutations.disconnect();
      cleanTilt.forEach((cleanup) => cleanup());
    };
  }, []);

  return (
    <div ref={ref} className="hp-motion contents">
      {children}
    </div>
  );
}
