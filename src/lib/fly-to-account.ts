const ACCOUNT_TARGET_SELECTOR = "[data-houzzat-account-target]";
const ACCOUNT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function pulseAccountTarget(target: HTMLElement) {
  target.classList.remove("houzzat-account-pulse");
  void target.offsetWidth;
  target.classList.add("houzzat-account-pulse");
  window.setTimeout(() => {
    target.classList.remove("houzzat-account-pulse");
  }, 900);
}

function runFly(
  from: { left: number; top: number; width: number; height: number },
  target: HTMLElement,
) {
  const to = target.getBoundingClientRect();
  if (from.width === 0 || to.width === 0) {
    pulseAccountTarget(target);
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
  ghost.innerHTML = ACCOUNT_SVG;
  Object.assign(ghost.style, {
    position: "fixed",
    left: `${startX}px`,
    top: `${startY}px`,
    width: `${size}px`,
    height: `${size}px`,
    zIndex: "220",
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
        transform: "translate(0, 0) scale(1) rotate(-8deg)",
        opacity: 1,
        offset: 0,
      },
      {
        transform: `translate(${dx * 0.4}px, ${dy * 0.3 - arcLift}px) scale(1.25) rotate(6deg)`,
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
    pulseAccountTarget(target);
  });
}

export type FlyFrom =
  | HTMLElement
  | Pick<DOMRect, "left" | "top" | "width" | "height">
  | null;

/**
 * Animate from the auth submit control to the header "Your Houzzat" / portal
 * button. Retries briefly so the header can swap Sign in → account after refresh.
 * Pass a DOMRect when the source element will unmount (modal close).
 */
export function flyToAccountPortal(from: FlyFrom) {
  if (typeof document === "undefined") return;

  const fromRect =
    from && "getBoundingClientRect" in from
      ? from.getBoundingClientRect()
      : from;

  let attempts = 0;

  function tryFly() {
    const target = document.querySelector(
      ACCOUNT_TARGET_SELECTOR,
    ) as HTMLElement | null;
    if (!target) {
      if (attempts < 24) {
        attempts += 1;
        window.setTimeout(tryFly, 50);
      }
      return;
    }
    runFly(
      fromRect ?? {
        left: window.innerWidth / 2 - 20,
        top: window.innerHeight / 2 - 20,
        width: 40,
        height: 40,
      },
      target,
    );
  }

  tryFly();
}
