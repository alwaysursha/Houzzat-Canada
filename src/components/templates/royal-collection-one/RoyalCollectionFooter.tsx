import Link from "next/link";
import { MlsDisclaimer } from "@/components/compliance/MlsDisclaimer";
import type { RoyalCollectionView } from "@/lib/tenancy/templates/resolve-royal-collection-view";
import { RoyalCollectionBrokerageMark } from "./RoyalCollectionBrokerageMark";
import { RoyalCollectionLockup } from "./RoyalCollectionLockup";
import { RoyalCollectionPlatformAttribution } from "./RoyalCollectionPlatformAttribution";
import { RoyalCollectionPreviewLink } from "./RoyalCollectionPreviewLink";
import { royalCollectionUnconnectedDisclosure } from "./unconnected-disclosure";
import styles from "./royal-collection.module.css";

const EXPLORE = [
  { href: "/search", label: "Explore homes" },
  { href: "/communities", label: "Communities" },
  { href: "/contact", label: "Contact" },
  { href: "/home-valuation", label: "Home value" },
] as const;

const LEGAL = [
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
          <div className={styles.wordmark} style={{ marginBottom: 22 }}>
            <RoyalCollectionLockup view={view} />
          </div>
          <RoyalCollectionBrokerageMark view={view} />
          <p className={styles.footerSub}>
            {view.agentName}
            {view.brokerage.name ? (
              <>
                <br />
                {view.brokerage.name}
              </>
            ) : null}
            {view.brokerage.address
              ? view.brokerage.address.split("\n").map((line) => (
                  <span key={line}>
                    <br />
                    {line}
                  </span>
                ))
              : view.markets[0]
                ? (
                    <>
                      <br />
                      {view.markets[0]}
                      {view.displayFixtureId ? ", Ontario" : ""}
                    </>
                  )
                : null}
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
          <Link href="/about" data-rc-allow="">
            {aboutLabel}
          </Link>
          {EXPLORE.map((link) => (
            <RoyalCollectionPreviewLink key={link.href} href={link.href} disabled={view.actionsDisabled}>
              {link.label}
            </RoyalCollectionPreviewLink>
          ))}
        </div>
        <div>
          <small>LEGAL</small>
          {LEGAL.map((link) => (
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
        {view.footerLegalText ? <span>{view.footerLegalText}</span> : null}
      </div>
      <RoyalCollectionPlatformAttribution />
      {view.listingDisclosure === "snapshot" ? null : (
        <div className={styles.footerLegal}>
          {view.listingDisclosure === "preview" ? (
            <p>
              Design preview only. No listing board is connected for this subscriber.
              Board attribution must be configured from the authorized feed before publication.
            </p>
          ) : view.listingDisclosure === "unconnected" ? (
            <p>{royalCollectionUnconnectedDisclosure(view.brokerage.name)}</p>
          ) : (
            <MlsDisclaimer />
          )}
        </div>
      )}
    </footer>
  );
}
