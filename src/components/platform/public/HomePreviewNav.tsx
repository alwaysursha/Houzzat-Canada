"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { HouzzatProWordmark } from "@/components/auth/HouzzatProWordmark";

type MenuId = "platform" | "solutions" | "resources";

type NavIconName =
  | "users"
  | "route"
  | "chat"
  | "house"
  | "search"
  | "capture"
  | "bell"
  | "pin"
  | "calendar"
  | "phone"
  | "user"
  | "team"
  | "building"
  | "spark"
  | "book"
  | "compass"
  | "news"
  | "story"
  | "help"
  | "mail";

type NavEntry = {
  title: string;
  body: string;
  href?: string;
  icon: NavIconName;
};

type NavGroup = {
  label: string;
  items: readonly NavEntry[];
};

const DESKTOP_SHOT = "/images/home-preview/houzzatpro-launchpad-desktop.png";
const MOBILE_SHOT = "/images/home-preview/houzzatpro-launchpad-mobile.png";

const PLATFORM: readonly NavGroup[] = [
  {
    label: "Manage leads",
    items: [
      {
        title: "CRM & Lead Management",
        body: "Organize leads, activity, notes and follow-ups.",
        href: "/product/crm",
        icon: "users",
      },
      {
        title: "Lead Routing",
        body: "Automatically connect new opportunities with the right agent.",
        href: "/product/lead-routing",
        icon: "route",
      },
      {
        title: "Conversations",
        body: "Keep client communication and history together.",
        href: "/product/conversations",
        icon: "chat",
      },
    ],
  },
  {
    label: "Generate business",
    items: [
      {
        title: "Real Estate Website",
        body: "Your branded website built to capture leads.",
        href: "/product/website",
        icon: "house",
      },
      {
        title: "MLS® Property Search",
        body: "Give clients a modern property-search experience.",
        href: "/product/mls-search",
        icon: "search",
      },
      {
        title: "Lead Capture",
        body: "Turn website visitors and property activity into opportunities.",
        href: "/product/lead-capture",
        icon: "capture",
      },
    ],
  },
  {
    label: "Engage & convert",
    items: [
      {
        title: "Alerts & Automation",
        body: "Keep clients engaged with timely follow-ups and alerts.",
        href: "/product/alerts",
        icon: "bell",
      },
      {
        title: "Properties & Viewings",
        body: "Search properties and organize client showings.",
        href: "/product/properties",
        icon: "pin",
      },
      {
        title: "Viewing Planner",
        body: "Build efficient viewing days and take them on the road.",
        href: "/product/viewing-planner",
        icon: "calendar",
      },
      {
        title: "HouzzatPRO Mobile",
        body: "Manage leads, properties and activity anywhere.",
        href: "/product/mobile",
        icon: "phone",
      },
    ],
  },
];

const SOLUTIONS_BUSINESS: readonly NavEntry[] = [
  {
    title: "Individual Agents",
    body: "Build your brand and manage your entire business.",
    href: "/solutions/agents",
    icon: "user",
  },
  {
    title: "Real Estate Teams",
    body: "Route opportunities and keep your team organized.",
    href: "/solutions/teams",
    icon: "team",
  },
  {
    title: "Brokerages",
    body: "Give agents a connected lead-generation ecosystem.",
    href: "/solutions/brokerages",
    icon: "building",
  },
];

const SOLUTIONS_GOALS: readonly NavEntry[] = [
  {
    title: "Generate More Leads",
    body: "Website, MLS® search and lead capture.",
    href: "/solutions/generate-leads",
    icon: "spark",
  },
  {
    title: "Convert More Leads",
    body: "CRM, conversations and follow-up workflows.",
    href: "/solutions/convert-leads",
    icon: "users",
  },
  {
    title: "Improve Client Experience",
    body: "Property alerts, viewing planning and communication.",
    href: "/solutions/client-experience",
    icon: "pin",
  },
  {
    title: "Work From Anywhere",
    body: "Run your business through HouzzatPRO Mobile.",
    href: "/solutions/work-from-anywhere",
    icon: "phone",
  },
];

const RESOURCES: readonly NavGroup[] = [
  {
    label: "Learn",
    items: [
      {
        title: "Resources",
        body: "Guides and strategies for growing your real-estate business.",
        href: "/resources",
        icon: "book",
      },
      {
        title: "Blog",
        body: "Real-estate marketing, technology and business insights.",
        href: "/blog",
        icon: "compass",
      },
      {
        title: "Help Centre",
        body: "Learn how to use HouzzatPRO.",
        href: "/support",
        icon: "help",
      },
    ],
  },
  {
    label: "Discover",
    items: [
      {
        title: "Product Updates",
        body: "See what's new in HouzzatPRO.",
        href: "/product-updates",
        icon: "news",
      },
      {
        title: "Customer Stories",
        body: "See how professionals use the platform.",
        href: "/customer-stories",
        icon: "story",
      },
      {
        title: "FAQ",
        body: "Common questions about HouzzatPRO.",
        href: "/faq",
        icon: "help",
      },
    ],
  },
  {
    label: "Get in touch",
    items: [
      {
        title: "Book a Demo",
        body: "See the platform with a HouzzatPRO specialist.",
        href: "/book-a-demo",
        icon: "calendar",
      },
      {
        title: "Contact Us",
        body: "Talk to our team.",
        href: "/contact",
        icon: "mail",
      },
    ],
  },
];

const MENUS: readonly MenuId[] = ["platform", "solutions", "resources"];

function navSection(pathname: string): MenuId | "pricing" | null {
  if (pathname === "/pricing") return "pricing";
  if (pathname.startsWith("/product")) return "platform";
  if (pathname.startsWith("/solutions")) return "solutions";
  if (
    pathname === "/resources" ||
    pathname === "/blog" ||
    pathname === "/product-updates" ||
    pathname === "/customer-stories" ||
    pathname === "/faq" ||
    pathname === "/support" ||
    pathname === "/contact"
  ) {
    return "resources";
  }
  return null;
}

function NavGlyph({ name }: { name: NavIconName }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    "aria-hidden": true,
    className: "h-[18px] w-[18px]",
  } as const;

  switch (name) {
    case "users":
      return (
        <svg {...common}>
          <path d="M16 20v-1.2A3.8 3.8 0 0 0 12.2 15H7.8A3.8 3.8 0 0 0 4 18.8V20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <circle cx="10" cy="8" r="3" stroke="currentColor" strokeWidth="1.6" />
          <path d="M19.5 20v-1.1a3.2 3.2 0 0 0-2.4-3.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M16.2 5.2a2.6 2.6 0 0 1 0 5.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case "route":
      return (
        <svg {...common}>
          <circle cx="6" cy="6" r="2.2" stroke="currentColor" strokeWidth="1.6" />
          <circle cx="18" cy="18" r="2.2" stroke="currentColor" strokeWidth="1.6" />
          <path d="M8 7.2c4.2.4 6.2 2.4 7.2 6.4M8.2 8.2 12 12l3.6 1.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "chat":
      return (
        <svg {...common}>
          <path d="M5 16.5 3.8 20l3.6-1.4A8.2 8.2 0 1 0 5 16.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      );
    case "house":
      return (
        <svg {...common}>
          <path d="M4 11.2 12 4l8 7.2V20H4v-8.8Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M10 20v-6h4v6" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      );
    case "search":
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="6" stroke="currentColor" strokeWidth="1.6" />
          <path d="M15.8 15.8 20 20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case "capture":
      return (
        <svg {...common}>
          <path d="M8 4.5h8l2 3H20v12H4v-12h2.2l1.8-3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <circle cx="12" cy="13" r="3" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      );
    case "bell":
      return (
        <svg {...common}>
          <path d="M6 16.5h12l-1.2-2V11a4.8 4.8 0 0 0-9.6 0v3.5L6 16.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M10 16.5a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      );
    case "pin":
      return (
        <svg {...common}>
          <path d="M12 21s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10Z" stroke="currentColor" strokeWidth="1.6" />
          <circle cx="12" cy="11" r="2" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...common}>
          <rect x="4" y="5" width="16" height="15" rx="2" stroke="currentColor" strokeWidth="1.6" />
          <path d="M8 3.5V7M16 3.5V7M4 10h16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case "phone":
      return (
        <svg {...common}>
          <rect x="8" y="3" width="8" height="18" rx="2" stroke="currentColor" strokeWidth="1.6" />
          <path d="M11 18h2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case "user":
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="3" stroke="currentColor" strokeWidth="1.6" />
          <path d="M5.5 19.5a6.5 6.5 0 0 1 13 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case "team":
      return (
        <svg {...common}>
          <circle cx="8" cy="9" r="2.4" stroke="currentColor" strokeWidth="1.6" />
          <circle cx="16" cy="9" r="2.4" stroke="currentColor" strokeWidth="1.6" />
          <path d="M3.8 18.5a4.4 4.4 0 0 1 8.1-1.4M12 17.2a4.4 4.4 0 0 1 8.2 1.3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case "building":
      return (
        <svg {...common}>
          <path d="M5 20V6.5L12 3l7 3.5V20" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M9 20v-4h6v4M9 9h.01M12 9h.01M15 9h.01M9 12.5h.01M12 12.5h.01M15 12.5h.01" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case "spark":
      return (
        <svg {...common}>
          <path d="M12 3.5 13.4 9 19 10.5 13.4 12 12 17.5 10.6 12 5 10.5 10.6 9 12 3.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      );
    case "book":
      return (
        <svg {...common}>
          <path d="M5 5.5h6.2A2.8 2.8 0 0 1 14 8.3V19H7.2A2.2 2.2 0 0 0 5 21V5.5Z" stroke="currentColor" strokeWidth="1.6" />
          <path d="M14 8.3A2.8 2.8 0 0 1 16.8 5.5H19V21h-5" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      );
    case "compass":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.6" />
          <path d="m14.8 9.2-1.3 4.3-4.3 1.3 1.3-4.3 4.3-1.3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      );
    case "news":
      return (
        <svg {...common}>
          <path d="M6 5h10v14H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.6" />
          <path d="M16 8h2.5A1.5 1.5 0 0 1 20 9.5V17a2 2 0 0 1-2 2h-2M8.5 9h5M8.5 12.5h5M8.5 16h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case "story":
      return (
        <svg {...common}>
          <path d="M7 4.5h7.2L18 8.2V19.5H7v-15Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M14 4.8V8.5h3.6M9.2 12h6M9.2 15.2h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case "help":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.6" />
          <path d="M9.6 9.4a2.4 2.4 0 1 1 3.5 2.1c-.7.4-1.1.9-1.1 1.7V14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M12 17h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "mail":
      return (
        <svg {...common}>
          <rect x="3.5" y="5.5" width="17" height="13" rx="2" stroke="currentColor" strokeWidth="1.6" />
          <path d="m4 7 8 6 8-6" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      );
    default: {
      const exhaustive: never = name;
      return exhaustive;
    }
  }
}

function entryKey(title: string) {
  return title;
}

function MenuEntry({
  item,
  compact,
  onNavigate,
}: {
  item: NavEntry;
  compact?: boolean;
  onNavigate: () => void;
}) {
  const body = (
    <>
      {compact ? null : (
        <span className="hp-mega-icon">
          <NavGlyph name={item.icon} />
        </span>
      )}
      <span className="min-w-0">
        <span className="hp-mega-title">{item.title}</span>
        {compact || !item.body ? null : <span className="hp-mega-body">{item.body}</span>}
      </span>
      {item.href ? (
        <svg className="hp-mega-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M5 12h14M14 7l5 5-5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : null}
    </>
  );

  if (!item.href) {
    return (
      <div className={`hp-mega-item is-pending${compact ? " is-compact" : ""}`}>
        {body}
      </div>
    );
  }

  return (
    <a
      href={item.href}
      className={`hp-mega-item${compact ? " is-compact" : ""}`}
      onClick={onNavigate}
    >
      {body}
    </a>
  );
}

export function HomePreviewNav({
  loginHref,
  demoHref,
  pathname = "/",
}: {
  loginHref: string;
  demoHref: string;
  pathname?: string;
}) {
  const drawerId = useId();
  const platformId = useId();
  const solutionsId = useId();
  const resourcesId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | null>(null);
  const pendingFocus = useRef(false);
  const [menu, setMenu] = useState<MenuId | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [accordion, setAccordion] = useState<MenuId | null>(null);
  const [scrolled, setScrolled] = useState(false);

  const panelId = (id: MenuId) => {
    switch (id) {
      case "platform":
        return platformId;
      case "solutions":
        return solutionsId;
      case "resources":
        return resourcesId;
      default: {
        const exhaustive: never = id;
        return exhaustive;
      }
    }
  };

  const clearClose = () => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const openMenu = (id: MenuId) => {
    clearClose();
    setMenu(id);
  };

  const scheduleClose = () => {
    clearClose();
    closeTimer.current = window.setTimeout(() => setMenu(null), 180);
  };

  const closeAll = () => {
    clearClose();
    setMenu(null);
    setDrawer(false);
  };

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 80);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeAll();
    };
    const onPointer = (event: PointerEvent) => {
      const root = rootRef.current;
      if (!root || !(event.target instanceof Node) || root.contains(event.target)) return;
      setMenu(null);
      setDrawer(false);
    };
    const desktop = window.matchMedia("(min-width: 1024px)");
    const onViewport = () => {
      if (desktop.matches) {
        setDrawer(false);
        setAccordion(null);
      } else {
        setMenu(null);
      }
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    desktop.addEventListener("change", onViewport);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
      desktop.removeEventListener("change", onViewport);
      clearClose();
    };
  }, []);

  useEffect(() => {
    if (!menu || !pendingFocus.current) return;
    pendingFocus.current = false;
    const panel = document.getElementById(panelId(menu));
    panel?.querySelector<HTMLElement>("a")?.focus();
  }, [menu, platformId, solutionsId, resourcesId]);

  useEffect(() => {
    if (!drawer) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = rootRef.current?.querySelector<HTMLElement>("[data-hp-drawer-close]");
    close?.focus();
    return () => {
      document.body.style.overflow = previous;
    };
  }, [drawer]);

  const onTriggerKey = (event: ReactKeyboardEvent<HTMLButtonElement>, id: MenuId) => {
    const index = MENUS.indexOf(id);
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const next = event.key === "ArrowRight" ? (index + 1) % MENUS.length : (index - 1 + MENUS.length) % MENUS.length;
      const nextId = MENUS[next];
      if (!nextId) return;
      openMenu(nextId);
      rootRef.current?.querySelector<HTMLButtonElement>(`[data-hp-trigger="${nextId}"]`)?.focus();
    }
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (menu === id) {
        document.getElementById(panelId(id))?.querySelector<HTMLElement>("a")?.focus();
        return;
      }
      pendingFocus.current = true;
      openMenu(id);
    }
  };

  const section = navSection(pathname);
  const demoArrow = (
    <svg className="hp-cta-arrow h-3.5 w-3.5 lg:h-4 lg:w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12h14M14 7l5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  return (
    <div ref={rootRef} className="hp-nav-root">
    <header
      className={`hp-site-header${scrolled ? " is-scrolled" : ""}`}
      onMouseEnter={clearClose}
      onMouseLeave={scheduleClose}
    >
      <div className="hp-site-bar">
        <a href="/" aria-label="HouzzatPRO home" className="shrink-0" data-hp-enter="fade" style={{ "--hp-delay": "40ms" } as CSSProperties}>
          <HouzzatProWordmark size="md" className="text-[1.2rem] min-[380px]:text-[1.45rem] sm:text-[1.7rem]" />
        </a>

        <nav className="hp-desk-nav" aria-label="Primary">
          {MENUS.map((id) => {
            const label = id === "platform" ? "Platform" : id === "solutions" ? "Solutions" : "Resources";
            return (
              <button
                key={id}
                type="button"
                className={`hp-trigger${menu === id ? " is-open" : ""}${section === id ? " is-current" : ""}`}
                data-hp-trigger={id}
                aria-expanded={menu === id}
                aria-current={section === id ? "page" : undefined}
                aria-controls={panelId(id)}
                onMouseEnter={() => openMenu(id)}
                onFocus={() => openMenu(id)}
                onKeyDown={(event) => onTriggerKey(event, id)}
              >
                {label}
                <svg className="hp-caret" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M4 6.2 8 10l4-3.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            );
          })}
          <a href="/pricing" className={`hp-trigger hp-trigger-link${section === "pricing" ? " is-current" : ""}`} aria-current={section === "pricing" ? "page" : undefined} onMouseEnter={() => setMenu(null)}>
            Pricing
          </a>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <a href={loginHref} className="hp-login">
            Log In
          </a>
          <a href={demoHref} data-hp-cta className="hp-demo">
            Book a Demo
            {demoArrow}
          </a>
          <button
            type="button"
            className="hp-nav-toggle"
            aria-expanded={drawer}
            aria-controls={drawerId}
            onClick={() => setDrawer(true)}
          >
            <span className="sr-only">Open menu</span>
            <span className="hp-burger" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </button>
        </div>
      </div>

      <div className={`hp-mega${menu ? " is-open" : ""}`} data-menu={menu ?? "platform"} inert={menu === null} aria-hidden={menu === null}>
        <div className="hp-mega-surface">
          <div id={platformId} className={`hp-mega-pane${menu === "platform" ? " is-active" : ""}`} role="region" aria-label="Platform">
            <div className="hp-mega-platform">
              <div className="hp-mega-columns">
                {PLATFORM.map((group) => (
                  <div key={group.label}>
                    <p className="hp-mega-kicker">{group.label}</p>
                    <div className="flex flex-col gap-0.5">
                      {group.items.map((item) => (
                        <MenuEntry key={entryKey(item.title)} item={item} onNavigate={closeAll} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <aside className="hp-mega-feature">
                <div className="hp-mega-shots" aria-hidden="true">
                  <Image src={DESKTOP_SHOT} alt="" width={1440} height={900} unoptimized className="hp-mega-laptop" />
                  <Image src={MOBILE_SHOT} alt="" width={390} height={844} unoptimized className="hp-mega-phone" />
                </div>
                <p className="hp-mega-kicker">The complete real estate platform</p>
                <p className="hp-mega-flow">Capture → Engage → Show → Convert</p>
                <a href="/product" className="hp-mega-cta" onClick={closeAll}>
                  Explore the Platform
                  <svg className="hp-cta-arrow h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M5 12h14M14 7l5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </a>
              </aside>
            </div>
          </div>

          <div id={solutionsId} className={`hp-mega-pane${menu === "solutions" ? " is-active" : ""}`} role="region" aria-label="Solutions">
            <div className="hp-mega-solutions">
              <div>
                <p className="hp-mega-kicker">For your business</p>
                {SOLUTIONS_BUSINESS.map((item) => (
                  <MenuEntry key={item.title} item={item} onNavigate={closeAll} />
                ))}
              </div>
              <div>
                <p className="hp-mega-kicker">By goal</p>
                {SOLUTIONS_GOALS.map((item) => (
                  <MenuEntry key={item.title} item={item} onNavigate={closeAll} />
                ))}
              </div>
              <aside className="hp-mega-card">
                <p className="hp-mega-card-title">Built for modern real estate professionals</p>
                <p className="hp-mega-flow">Website · CRM · MLS® · Mobile · Automation</p>
                <a href="/product" className="hp-mega-cta" onClick={closeAll}>
                  Find Your Solution
                  <svg className="hp-cta-arrow h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M5 12h14M14 7l5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </a>
              </aside>
            </div>
          </div>

          <div id={resourcesId} className={`hp-mega-pane${menu === "resources" ? " is-active" : ""}`} role="region" aria-label="Resources">
            <div className="hp-mega-columns">
              {RESOURCES.map((group) => (
                <div key={group.label}>
                  <p className="hp-mega-kicker">{group.label}</p>
                  {group.items.map((item) => (
                    <MenuEntry key={item.title} item={item} onNavigate={closeAll} />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

    </header>
      <div className={`hp-scrim${drawer ? " is-open" : ""}`} onClick={closeAll} />
      <div
        id={drawerId}
        className={`hp-drawer${drawer ? " is-open" : ""}`}
        role="dialog"
        aria-modal={drawer}
        aria-label="HouzzatPRO menu"
        inert={!drawer}
      >
        <div className="hp-drawer-top">
          <a href="/" aria-label="HouzzatPRO home" onClick={closeAll}>
            <HouzzatProWordmark size="md" className="text-[1.35rem]" />
          </a>
          <button type="button" className="hp-drawer-close" data-hp-drawer-close onClick={closeAll}>
            <span className="sr-only">Close menu</span>
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="hp-drawer-scroll">
          {MENUS.map((id) => {
            const label = id === "platform" ? "Platform" : id === "solutions" ? "Solutions" : "Resources";
            const open = accordion === id;
            const groups: readonly NavGroup[] =
              id === "platform"
                ? PLATFORM
                : id === "solutions"
                  ? [
                      { label: "For your business", items: SOLUTIONS_BUSINESS },
                      { label: "By goal", items: SOLUTIONS_GOALS },
                    ]
                  : RESOURCES;
            return (
              <div key={id} className="hp-acc">
                <button
                  type="button"
                  className="hp-acc-trigger"
                  aria-expanded={open}
                  onClick={() => setAccordion(open ? null : id)}
                >
                  {label}
                  <span className={`hp-acc-plus${open ? " is-open" : ""}`} aria-hidden="true" />
                </button>
                <div className={`hp-acc-panel${open ? " is-open" : ""}`}>
                  <div className="hp-acc-inner">
                    {groups.map((group) => (
                      <div key={group.label} className="px-1 pb-2">
                        <p className="hp-mega-kicker">{group.label}</p>
                        {group.items.map((item) => (
                          <MenuEntry key={item.title} item={item} compact onNavigate={closeAll} />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
          <a href="/pricing" className="hp-acc-link" onClick={closeAll}>Pricing</a>
          <a href={loginHref} className="hp-acc-link" onClick={closeAll}>Log In</a>
          <a href={demoHref} data-hp-cta className="hp-demo hp-demo-block" onClick={closeAll}>
            Book a Demo
            {demoArrow}
          </a>
        </div>
      </div>
    </div>
  );
}
