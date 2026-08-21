import { notifySavedListingsChanged } from "@/lib/account/saved-listings-sync";

const SAVED_TARGET_SELECTOR = "[data-houzzat-saved-target]";
const HEART_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="100%" height="100%" fill="currentColor" aria-hidden="true"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`;

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Animate a heart from a save control to the Saved tools button. */
export function flyHeartToSaved(
  fromEl: HTMLElement,
  options?: { skipNotify?: boolean },
) {
  if (typeof document === "undefined") return;

  const finish = () => {
    if (!options?.skipNotify) notifySavedListingsChanged();
  };

  const target = document.querySelector(
    SAVED_TARGET_SELECTOR,
  ) as HTMLElement | null;
  if (!target) {
    finish();
    return;
  }

  const from = fromEl.getBoundingClientRect();
  const to = target.getBoundingClientRect();
  if (from.width === 0 || to.width === 0) {
    finish();
    return;
  }

  const size = 28;
  const startX = from.left + from.width / 2 - size / 2;
  const startY = from.top + from.height / 2 - size / 2;
  const endX = to.left + to.width / 2 - size / 2;
  const endY = to.top + to.height / 2 - size / 2;
  const dx = endX - startX;
  const dy = endY - startY;

  const ghost = document.createElement("div");
  ghost.setAttribute("aria-hidden", "true");
  ghost.innerHTML = HEART_SVG;
  Object.assign(ghost.style, {
    position: "fixed",
    left: `${startX}px`,
    top: `${startY}px`,
    width: `${size}px`,
    height: `${size}px`,
    zIndex: "200",
    pointerEvents: "none",
    color: "var(--canopy, #0f6b4c)",
    filter: "drop-shadow(0 4px 10px rgba(15, 107, 76, 0.35))",
    willChange: "transform, opacity",
  });
  document.body.appendChild(ghost);

  const arcLift = Math.min(72, Math.max(36, Math.abs(dy) * 0.25 + 40));

  const animation = ghost.animate(
    [
      {
        transform: "translate(0, 0) scale(1) rotate(-8deg)",
        opacity: 1,
        offset: 0,
      },
      {
        transform: `translate(${dx * 0.45}px, ${dy * 0.35 - arcLift}px) scale(1.2) rotate(6deg)`,
        opacity: 1,
        offset: 0.55,
      },
      {
        transform: `translate(${dx}px, ${dy}px) scale(0.3) rotate(0deg)`,
        opacity: 0.2,
        offset: 1,
      },
    ],
    {
      duration: prefersReducedMotion() ? 1 : 780,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      fill: "forwards",
    },
  );

  void animation.finished
    .then(() => {
      ghost.remove();
      target.classList.remove("houzzat-saved-pulse");
      // Retrigger CSS animation
      void target.offsetWidth;
      target.classList.add("houzzat-saved-pulse");
      window.setTimeout(() => {
        target.classList.remove("houzzat-saved-pulse");
      }, 700);
      finish();
    })
    .catch(() => {
      ghost.remove();
      finish();
    });
}
