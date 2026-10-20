import Link from "next/link";
import { MlsDisclaimer } from "@/components/compliance/MlsDisclaimer";
import type { RoyalCollectionView } from "@/lib/tenancy/templates/resolve-royal-collection-view";
import { ROYAL_COLLECTION_PREVIEW_ACTION_NOTE } from "./preview-action-note";
import { RoyalCollectionPreviewLink } from "./RoyalCollectionPreviewLink";
import styles from "./royal-collection.module.css";

const LINKS = [
  { href: "/search", label: "Explore homes" },
  { href: "/areas", label: "Communities" },
  { href: "/home-valuation", label: "Home value" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
] as const;

export function RoyalCollectionFooter({ view }: { view: RoyalCollectionView }) {
  const aboutLabel = view.agentName ? `About ${view.agentName}` : "About";
  return (
    <footer className={styles.footer} id="rc-contact">
      <div className={styles.footerTop}>
        <div>
          <div className={styles.eyebrow}>Your next chapter begins here</div>
          <h2>
            Let&apos;s make your
            <br />
            next move <em>matter.</em>
          </h2>
          {view.email ? (
            <a className={`${styles.button} ${styles.buttonGold}`} href={`mailto:${view.email}`}>
              Connect with {view.firstName || "us"} ↗
            </a>
          ) : null}
        </div>
        <div>
          <div className={styles.wordmark} style={{ marginBottom: 25 }}>
            <span className={styles.wordmarkMark} aria-hidden="true">
              {view.provisionalWordmark ? "H" : (view.brandName.trim()[0] || "H")}
            </span>
            <span className={styles.wordmarkCopy}>
              <span className={styles.wordmarkTop}>{view.wordmarkMark || view.brandName}</span>
              <span className={styles.wordmarkSub}>{view.wordmarkSub || "REAL ESTATE"}</span>
            </span>
          </div>
          <p className={styles.footerSub}>
            {view.agentName}
            {view.brokerage.name ? (
              <>
                <br />
                {view.brokerage.name}
              </>
            ) : null}
            {view.markets[0] ? (
              <>
                <br />
                {view.markets[0]}
                {view.displayFixtureId ? ", Ontario" : ""}
              </>
            ) : null}
            {view.brokerage.address ? (
              <>
                <br />
                {view.brokerage.address}
              </>
            ) : null}
          </p>
          <p className={styles.footerSub}>
            {view.phone ? (
              <>
                <a href={`tel:${view.phone}`}>{view.phone}</a>
                <br />
              </>
            ) : null}
            {view.email ? <a href={`mailto:${view.email}`}>{view.email}</a> : null}
          </p>
        </div>
      </div>
      <nav className={styles.footerLinks} aria-label="Footer">
        <div>
          <small>EXPLORE</small>
          <Link href="/#about-the-agent" data-rc-allow="">
            {aboutLabel}
          </Link>
          {LINKS.slice(0, 3).map((link) => (
            <RoyalCollectionPreviewLink key={link.href} href={link.href} disabled={view.actionsDisabled}>
              {link.label}
            </RoyalCollectionPreviewLink>
          ))}
        </div>
        <div>
          <small>LEGAL</small>
          {LINKS.slice(3).map((link) => (
            <RoyalCollectionPreviewLink key={link.href} href={link.href} disabled={view.actionsDisabled}>
              {link.label}
            </RoyalCollectionPreviewLink>
          ))}
        </div>
      </nav>
      <div className={styles.footerBottom}>
        <span>
          © {new Date().getFullYear()} {view.brandName}
          {view.actionsDisabled ? " · Design concept only" : ""}
        </span>
        <span>
          <em>HOUZZATPRO</em> / ROYAL COLLECTION — SIGNATURE ONE
        </span>
        <span>
          {view.footerLegalText ||
            (view.actionsDisabled
              ? ROYAL_COLLECTION_PREVIEW_ACTION_NOTE
              : "Legal disclosures use the verified tenant configuration.")}
        </span>
      </div>
      <div className={styles.footerLegal}>
        {view.displayFixtureId ? (
          <p>
            Design preview only. No listing board is connected for this subscriber.
            Board attribution must be configured from the authorized feed before publication.
          </p>
        ) : (
          <MlsDisclaimer />
        )}
      </div>
    </footer>
  );
}
