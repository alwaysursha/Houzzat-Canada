"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import {
  HIGH_OCTANE_LOGO_URL,
  type RoyalCollectionView,
} from "@/lib/tenancy/templates/resolve-royal-collection-view";
import { ROYAL_COLLECTION_ONE_TEMPLATE_ID } from "@/lib/tenancy/templates/types";
import { AuthOpenButton } from "@/components/auth/AuthOpenButton";
import { RoyalCollectionLockup } from "./RoyalCollectionLockup";
import { RoyalCollectionPreviewLink } from "./RoyalCollectionPreviewLink";
import styles from "./royal-collection.module.css";

function HeaderAccountLinks({
  className,
  disabled,
  onNavigate,
}: {
  className: string;
  disabled: boolean;
  onNavigate?: () => void;
}) {
  const { status } = useSession();
  if (status === "authenticated") {
    return (
      <div className={className}>
        <RoyalCollectionPreviewLink
          href="/account"
          disabled={disabled}
          onNavigate={onNavigate}
        >
          Account
        </RoyalCollectionPreviewLink>
      </div>
    );
  }
  if (disabled) {
    return (
      <div className={className}>
        <RoyalCollectionPreviewLink href="/auth/sign-in" disabled onNavigate={onNavigate}>
          Log in
        </RoyalCollectionPreviewLink>
        <RoyalCollectionPreviewLink href="/auth/sign-up" disabled onNavigate={onNavigate}>
          Sign up
        </RoyalCollectionPreviewLink>
      </div>
    );
  }
  return (
    <div className={className}>
      <AuthOpenButton mode="sign-in" onClick={onNavigate}>
        Log in
      </AuthOpenButton>
      <AuthOpenButton mode="sign-up" onClick={onNavigate}>
        Sign up
      </AuthOpenButton>
    </div>
  );
}

const DISCOVER = [
  { href: "/search", label: "Explore Homes" },
  { href: "#rc-communities", label: "Explore Communities", hash: true },
  { href: "/home-valuation", label: "What's My Home Worth?" },
  { href: "/#about-the-agent", label: "Meet the agent", hash: true },
] as const;

export function RoyalCollectionHeader({
  view,
  previewBarActive = false,
}: {
  view: RoyalCollectionView;
  previewBarActive?: boolean;
}) {
  const pathname = usePathname();
  const menuId = useId();
  const communitiesId = useId();
  const headerRef = useRef<HTMLElement | null>(null);
  const [solid, setSolid] = useState(false);
  const [discoverOpen, setDiscoverOpen] = useState(false);
  const [communitiesOpen, setCommunitiesOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileCommunitiesOpen, setMobileCommunitiesOpen] = useState(false);
  const onHomepage = pathname === "/";
  const homeHref = view.actionsDisabled
    ? `/?previewTemplate=${ROYAL_COLLECTION_ONE_TEMPLATE_ID}`
    : "/";
  const meetLabel = view.agentName ? `Meet ${view.agentName}` : "Meet the agent";
  const aboutHref = "/about";
  const sellHref = onHomepage ? "#rc-valuation" : "/home-valuation";
  const aboutActive = pathname === "/about";
  const communitiesActive =
    pathname.startsWith("/communities") ||
    pathname.startsWith("/homes-for-sale") ||
    pathname.startsWith("/areas");
  const searchActive = pathname.startsWith("/search");
  const still = view.scenes.find((scene) => scene.conceptStill)?.conceptStill;

  useLayoutEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const bar = document.querySelector<HTMLElement>("[data-owner-preview-bar]");

    const apply = () => {
      const barHeight =
        previewBarActive && bar ? Math.ceil(bar.getBoundingClientRect().height) : 0;
      header.style.top = barHeight ? `${barHeight}px` : "";
      document.documentElement.style.setProperty("--rc-preview-bar", `${barHeight}px`);
      const headerHeight = Math.ceil(header.getBoundingClientRect().height);
      document.documentElement.style.setProperty(
        "--rc-header-offset",
        `${barHeight + headerHeight}px`,
      );
      document.documentElement.style.setProperty(
        "--rc-fixed-header",
        `${headerHeight}px`,
      );
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(header);
    if (previewBarActive && bar) observer.observe(bar);
    return () => {
      observer.disconnect();
      header.style.top = "";
      document.documentElement.style.removeProperty("--rc-preview-bar");
      document.documentElement.style.removeProperty("--rc-header-offset");
      document.documentElement.style.removeProperty("--rc-fixed-header");
    };
  }, [previewBarActive]);

  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileOpen]);

  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 50);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setDiscoverOpen(false);
      setCommunitiesOpen(false);
      setMobileOpen(false);
      setMobileCommunitiesOpen(false);
    };
    const onClick = (event: MouseEvent) => {
      if (!headerRef.current?.contains(event.target as Node)) {
        setDiscoverOpen(false);
        setCommunitiesOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onClick);
    };
  }, []);

  const closeMenus = () => {
    setDiscoverOpen(false);
    setCommunitiesOpen(false);
    setMobileOpen(false);
  };

  const blankUtility = view.logoUrl === HIGH_OCTANE_LOGO_URL;

  return (
    <header ref={headerRef} className={styles.header} data-rc-header="signature">
      <div
        className={blankUtility ? `${styles.utility} ${styles.utilityBlank}` : styles.utility}
        aria-hidden={blankUtility ? true : undefined}
      >
        {blankUtility ? null : (
          <>
            <p className={styles.utilityBrand}>{view.brandName}</p>
            <div className={styles.utilityActions}>
              {view.phone ? (
                <a className={styles.utilityLink} href={`tel:${view.phone}`}>
                  {view.phone}
                </a>
              ) : null}
              {view.email ? (
                <a className={styles.utilityLink} href={`mailto:${view.email}`}>
                  {view.email}
                </a>
              ) : null}
              <RoyalCollectionPreviewLink
                className={styles.utilityLogin}
                href="/auth/sign-in"
                disabled={view.actionsDisabled}
              >
                Login
              </RoyalCollectionPreviewLink>
            </div>
          </>
        )}
      </div>
      <div
        className={[
          styles.mast,
          !onHomepage || solid || mobileOpen ? styles.mastSolid : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <Link className={styles.wordmark} href={homeHref} data-rc-allow="" aria-label={`${view.brandName} home`}>
          <RoyalCollectionLockup view={view} />
        </Link>
        <nav className={styles.nav} aria-label="Primary">
          <button
            type="button"
            className={[styles.navButton, searchActive ? styles.navLinkOn : ""]
              .filter(Boolean)
              .join(" ")}
            aria-expanded={discoverOpen}
            aria-controls={menuId}
            data-rc-allow=""
            onClick={() => {
              setDiscoverOpen((open) => !open);
              setCommunitiesOpen(false);
            }}
          >
            Discover <span className={styles.chevron} aria-hidden="true" />
          </button>
          <div
            className={styles.navGroup}
            onMouseEnter={() => setCommunitiesOpen(true)}
            onMouseLeave={() => setCommunitiesOpen(false)}
          >
            <button
              type="button"
              className={[styles.navButton, communitiesActive ? styles.navLinkOn : ""]
                .filter(Boolean)
                .join(" ")}
              aria-expanded={communitiesOpen}
              aria-controls={communitiesId}
              data-rc-allow=""
              onClick={() => {
                setCommunitiesOpen(true);
                setDiscoverOpen(false);
              }}
            >
              Communities <span className={styles.chevron} aria-hidden="true" />
            </button>
            <div
              id={communitiesId}
              inert={communitiesOpen ? undefined : true}
              className={[styles.communitiesMenu, communitiesOpen ? styles.communitiesMenuOpen : ""]
                .filter(Boolean)
                .join(" ")}
            >
              {view.navCommunities.map((place) => (
                <RoyalCollectionPreviewLink
                  key={place.name}
                  href={place.href}
                  disabled={view.actionsDisabled}
                  onNavigate={() => setCommunitiesOpen(false)}
                >
                  {place.name}
                </RoyalCollectionPreviewLink>
              ))}
            </div>
          </div>
          <Link
            className={[styles.navLink, aboutActive ? styles.navLinkOn : ""].filter(Boolean).join(" ")}
            href={aboutHref}
            data-rc-allow=""
            aria-current={aboutActive ? "page" : undefined}
          >
            {view.agentName ? `About ${view.firstName}` : "About"}
          </Link>
          <Link
            className={[styles.navLink, pathname.startsWith("/home-valuation") ? styles.navLinkOn : ""]
              .filter(Boolean)
              .join(" ")}
            href={sellHref}
            data-rc-allow=""
          >
            Sell With Us
          </Link>
        </nav>
        <div className={styles.mastRight}>
          <HeaderAccountLinks
            className={styles.accountLinks}
            disabled={view.actionsDisabled}
          />
          <Link className={`${styles.button} ${styles.buttonGold}`} href="#rc-contact" data-rc-allow="">
            Let&apos;s Connect ↗
          </Link>
          <button
            type="button"
            className={styles.menuButton}
            aria-expanded={mobileOpen}
            aria-controls="rc-mobile-nav"
            data-rc-allow=""
            onClick={() => setMobileOpen((open) => !open)}
          >
            <span className="sr-only">{mobileOpen ? "Close menu" : "Open menu"}</span>
            <span aria-hidden="true">{mobileOpen ? "×" : "☰"}</span>
          </button>
        </div>
        <div
          id={menuId}
          inert={discoverOpen ? undefined : true}
          className={[styles.mega, discoverOpen ? styles.megaOpen : ""].filter(Boolean).join(" ")}
        >
          <div>
            <small className={styles.megaKicker}>
              {view.displayFixtureId ? "Discover Niagara" : "Discover"}
            </small>
            <h3>
              Find your
              <br />
              <em>extraordinary.</em>
            </h3>
            <p>
              {view.displayFixtureId
                ? "A personal perspective on the homes, places and possibilities that make Niagara exceptional."
                : "A personal perspective on the homes, places and possibilities ahead."}
            </p>
          </div>
          <div className={styles.megaList}>
            {DISCOVER.map((item) =>
              "hash" in item && item.hash ? (
                <Link
                  key={item.href}
                  href={
                    item.href === "#rc-communities" && !onHomepage
                      ? "/communities"
                      : item.href === "/#about-the-agent"
                        ? aboutHref
                        : item.href
                  }
                  data-rc-allow=""
                  onClick={closeMenus}
                >
                  {item.label === "Meet the agent" ? meetLabel : item.label} <span>↗</span>
                </Link>
              ) : (
                <RoyalCollectionPreviewLink
                  key={item.href}
                  href={item.href}
                  disabled={view.actionsDisabled}
                  onNavigate={closeMenus}
                >
                  {item.label} <span>↗</span>
                </RoyalCollectionPreviewLink>
              ),
            )}
          </div>
          <div
            className={styles.megaPhoto}
            style={still ? { backgroundImage: `url(${still})` } : undefined}
            role="img"
            aria-label="Niagara concept still"
          />
        </div>
      </div>
      <div
        id="rc-mobile-nav"
        inert={mobileOpen ? undefined : true}
        className={[styles.drawer, mobileOpen ? styles.drawerOpen : ""].filter(Boolean).join(" ")}
      >
        <div className={styles.drawerInner}>
          {DISCOVER.map((item) =>
            "hash" in item && item.hash ? (
              <Link
                key={item.href}
                href={
                  item.href === "#rc-communities" && !onHomepage
                    ? "/communities"
                    : item.href === "/#about-the-agent"
                      ? aboutHref
                      : item.href
                }
                data-rc-allow=""
                onClick={closeMenus}
              >
                {item.label === "Meet the agent" ? meetLabel : item.label}
              </Link>
            ) : (
              <RoyalCollectionPreviewLink
                key={item.href}
                href={item.href}
                disabled={view.actionsDisabled}
                onNavigate={closeMenus}
              >
                {item.label}
              </RoyalCollectionPreviewLink>
            ),
          )}
          <button
            type="button"
            data-rc-allow=""
            aria-expanded={mobileCommunitiesOpen}
            onClick={() => setMobileCommunitiesOpen((open) => !open)}
          >
            Communities
          </button>
          {mobileCommunitiesOpen
            ? view.navCommunities.map((place) => (
                <RoyalCollectionPreviewLink
                  key={place.name}
                  href={place.href}
                  className={styles.drawerSubLink}
                  disabled={view.actionsDisabled}
                  onNavigate={closeMenus}
                >
                  {place.name}
                </RoyalCollectionPreviewLink>
              ))
            : null}
          <Link href={aboutHref} data-rc-allow="" onClick={closeMenus}>
            {view.agentName ? `About ${view.agentName}` : "About"}
          </Link>
          <Link href={sellHref} data-rc-allow="" onClick={closeMenus}>
            Sell With Us
          </Link>
          <HeaderAccountLinks
            className={styles.drawerAccount}
            disabled={view.actionsDisabled}
            onNavigate={closeMenus}
          />
        </div>
      </div>
    </header>
  );
}
