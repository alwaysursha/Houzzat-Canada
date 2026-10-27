"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowRight, Phone } from "lucide-react";
import { ViewingBookingModal } from "@/components/listings/ViewingBookingModal";
import styles from "./royal-property.module.css";

const MOBILE_QUERY = "(max-width: 767px)";
const BAR_GAP_PX = 18;

function phoneHref(phone: string): string {
  return "tel:" + phone.replace(/[^\d+]/g, "");
}

/**
 * Fixed mobile concierge bar for a Royal Collection listing.
 * Identity comes from the property model, which is already the workspace agent.
 */
export function RoyalCollectionConciergeBar({
  agentName,
  role,
  brokerageName,
  phone,
  photoUrl,
}: {
  agentName: string;
  role: string | null;
  brokerageName: string;
  phone: string | null;
  photoUrl: string | null;
}) {
  const barRef = useRef<HTMLElement>(null);
  const pathname = usePathname();
  const [mobile, setMobile] = useState(false);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [viewingNear, setViewingNear] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const viewingNearRef = useRef(false);
  const concealed = viewingNear || dialogOpen;

  useEffect(() => {
    const media = window.matchMedia(MOBILE_QUERY);
    const sync = () => setMobile(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const target = document.getElementById("rc-contact");
    if (!target) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        const ratio = entry.intersectionRatio;
        const next = viewingNearRef.current
          ? entry.isIntersecting && ratio > 0.04
          : ratio >= 0.22;
        if (next === viewingNearRef.current) return;
        viewingNearRef.current = next;
        setViewingNear(next);
      },
      { threshold: [0, 0.04, 0.22, 0.4] },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    function syncDialog(event: Event) {
      const dialog = event.target;
      if (!(dialog instanceof HTMLDialogElement)) return;
      setDialogOpen(Boolean(document.querySelector("dialog[open]")));
    }
    document.addEventListener("toggle", syncDialog, true);
    return () => document.removeEventListener("toggle", syncDialog, true);
  }, []);

  useLayoutEffect(() => {
    const root = document.documentElement;
    if (!mobile || concealed) {
      root.style.setProperty("--rc-concierge-bar", "0px");
      return () => {
        root.style.setProperty("--rc-concierge-bar", "0px");
      };
    }
    const bar = barRef.current;
    if (!bar) return;
    const write = () => {
      root.style.setProperty("--rc-concierge-bar", `${bar.offsetHeight + BAR_GAP_PX}px`);
    };
    write();
    const observer = new ResizeObserver(write);
    observer.observe(bar);
    return () => {
      observer.disconnect();
      root.style.setProperty("--rc-concierge-bar", "0px");
    };
  }, [mobile, concealed]);

  if (!mobile || !agentName) return null;

  const bookingPath = pathname.split("?")[0] || "/";
  const mlsNumber = bookingPath.split("/").filter(Boolean).pop() ?? "";

  return (
    <aside
      ref={barRef}
      className={styles.concierge}
      data-rc-concierge=""
      hidden={concealed}
      aria-label="Signature concierge"
    >
      {photoUrl ? (
        <span className={styles.conciergePhoto}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoUrl} alt="" />
        </span>
      ) : null}
      <div className={styles.conciergeIdentity}>
        <p className={styles.conciergeName}>{agentName}</p>
        {role ? <p className={styles.conciergeRole}>{role}</p> : null}
        {brokerageName ? <p className={styles.conciergeBrokerage}>{brokerageName}</p> : null}
      </div>
      {phone ? (
        <a className={styles.conciergeCall} href={phoneHref(phone)} aria-label={`Call ${agentName}`}>
          <Phone aria-hidden />
        </a>
      ) : null}
      <button type="button" className={styles.conciergeCta} onClick={() => setBookingOpen(true)}>
        Request Private Viewing
        <ArrowRight aria-hidden />
      </button>
      {mlsNumber ? (
        <ViewingBookingModal
          open={bookingOpen}
          onClose={() => setBookingOpen(false)}
          mlsNumber={mlsNumber}
          callbackPath={bookingPath}
        />
      ) : null}
    </aside>
  );
}
