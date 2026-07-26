const ROUTE_TARGET_SELECTOR = "[data-houzzat-route-planner-target]";
const ROUTE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/></svg>`;

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function pulseRoutePlannerTarget(target: HTMLElement) {
  target.classList.remove("houzzat-route-planner-pulse");
  void target.offsetWidth;
  target.classList.add("houzzat-route-planner-pulse");
  window.setTimeout(() => {
    target.classList.remove("houzzat-route-planner-pulse");
  }, 1200);
}

/** Animate a route icon from an add control to the floating Route Planner chip. */
export function flyRouteToPlanner(fromEl: HTMLElement) {
  if (typeof document === "undefined") return;

  const target = document.querySelector(
    ROUTE_TARGET_SELECTOR,
  ) as HTMLElement | null;
  if (!target) return;

  const from = fromEl.getBoundingClientRect();
  const to = target.getBoundingClientRect();
  if (from.width === 0 || to.width === 0) {
    pulseRoutePlannerTarget(target);
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
  ghost.innerHTML = ROUTE_SVG;
  Object.assign(ghost.style, {
    position: "fixed",
    left: `${startX}px`,
    top: `${startY}px`,
    width: `${size}px`,
    height: `${size}px`,
    zIndex: "200",
    pointerEvents: "none",
    color: "var(--canopy, #0f6b4c)",
    filter: "drop-shadow(0 4px 10px rgba(15, 107, 76, 0.4))",
    willChange: "transform, opacity",
  });
  document.body.appendChild(ghost);

  const arcLift = Math.min(80, Math.max(40, Math.abs(dy) * 0.22 + 44));

  const animation = ghost.animate(
    [
      {
        transform: "translate(0, 0) scale(1) rotate(-10deg)",
        opacity: 1,
        offset: 0,
      },
      {
        transform: `translate(${dx * 0.4}px, ${dy * 0.3 - arcLift}px) scale(1.25) rotate(8deg)`,
        opacity: 1,
        offset: 0.55,
      },
      {
        transform: `translate(${dx}px, ${dy}px) scale(0.35) rotate(0deg)`,
        opacity: 0.15,
        offset: 1,
      },
    ],
    {
      duration: prefersReducedMotion() ? 1 : 820,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      fill: "forwards",
    },
  );

  void animation.finished.then(() => {
    ghost.remove();
    pulseRoutePlannerTarget(target);
  });
}
