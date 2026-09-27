"use client";

import { useEffect, useId, useState, type CSSProperties } from "react";

type NavLink = { label: string; href: string };

export function HomePreviewNav({
  links,
  loginHref,
  demoHref,
}: {
  links: readonly NavLink[];
  loginHref: string;
  demoHref: string;
}) {
  const menuId = useId();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => {
      if (desktop.matches) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    desktop.addEventListener("change", closeOnDesktop);
    window.addEventListener("keydown", onKey);
    return () => {
      desktop.removeEventListener("change", closeOnDesktop);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <>
      <nav className="hidden items-center gap-8 text-[13px] font-medium text-[#16352c] lg:flex" aria-label="Primary" data-hp-enter="fade" style={{ "--hp-delay": "120ms" } as CSSProperties}>
        {links.map((item) => (
          <a key={item.label} href={item.href} className="hp-link">
            {item.label}
          </a>
        ))}
      </nav>

      <div className="flex items-center gap-2" data-hp-enter="fade" style={{ "--hp-delay": "180ms" } as CSSProperties}>
        <a
          href={loginHref}
          className="hidden min-h-11 items-center rounded-xl px-4 text-sm font-medium text-[#17352d] transition-colors hover:bg-white/60 sm:inline-flex"
        >
          Login
        </a>
        <a
          href={demoHref}
          data-hp-cta
          className="inline-flex h-11 items-center gap-1.5 rounded-full bg-[#07583f] px-3 text-[13px] font-semibold text-white shadow-[0_8px_22px_rgba(7,88,63,.18)] lg:h-auto lg:min-h-11 lg:gap-2 lg:rounded-xl lg:px-5 lg:text-sm"
        >
          Book a Demo
          <svg className="hp-cta-arrow h-3.5 w-3.5 lg:h-4 lg:w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M5 12h14M14 7l5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
        <button
          type="button"
          className={`hp-nav-toggle grid h-11 w-11 place-items-center rounded-xl text-[#17352d] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 lg:hidden${open ? " is-open" : ""}`}
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() => setOpen((value) => !value)}
        >
          <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
          <span className="hp-burger" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </button>
      </div>

      <div
        id={menuId}
        className={`hp-nav-panel absolute inset-x-0 top-full z-50 lg:hidden${open ? " is-open" : ""}`}
        aria-hidden={!open}
        inert={!open}
      >
        <div className="hp-nav-panel-inner">
          <div className="border-b border-[#d7e4dc] bg-[#f7faf6]/95 shadow-[0_22px_40px_rgba(16,40,32,.08)] backdrop-blur-md">
          <nav aria-label="Mobile" className="flex flex-col px-5 py-2">
            {links.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className="hp-link flex min-h-11 items-center text-[15px] font-medium text-[#16352c]"
                onClick={() => setOpen(false)}
              >
                {item.label}
              </a>
            ))}
            <a
              href={loginHref}
              className="flex min-h-11 items-center text-[15px] font-medium text-[#17352d] sm:hidden"
              onClick={() => setOpen(false)}
            >
              Login
            </a>
          </nav>
          </div>
        </div>
      </div>
    </>
  );
}
