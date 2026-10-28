import type { RoyalCollectionView } from "@/lib/tenancy/templates/resolve-royal-collection-view";
import { RoyalCollectionReveal } from "./RoyalCollectionReveal";
import styles from "./royal-collection.module.css";

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] || "")
    .join("")
    .toUpperCase();
}

export function RoyalCollectionAbout({ view }: { view: RoyalCollectionView }) {
  const name = view.agentName || view.brandName;
  return (
    <section
      className={
        view.mobileAboutPortraitUrl
          ? `${styles.section} ${styles.about} ${styles.aboutHasFullPortrait}`
          : `${styles.section} ${styles.about}`
      }
      id="about-the-agent"
      aria-label={view.agentName ? `About ${view.agentName}` : `About ${view.brandName}`}
    >
      <RoyalCollectionReveal className={styles.aboutImage}>
        {view.resolvedAgentPortraitUrl ? (
          <picture>
            {view.mobileAboutPortraitUrl ? (
              <source media="(max-width: 767px)" srcSet={view.mobileAboutPortraitUrl} />
            ) : null}
            {/* eslint-disable-next-line @next/next/no-img-element -- tenant portrait URL */}
            <img className={styles.aboutPhoto} src={view.resolvedAgentPortraitUrl} alt="" />
          </picture>
        ) : (
          <div className={styles.aboutMonogram} aria-hidden="true">
            {initials(name)}
          </div>
        )}
        <span className={styles.aboutPortrait}>{name}</span>
      </RoyalCollectionReveal>
      <RoyalCollectionReveal className={styles.aboutCopy}>
        <div className={styles.sectionMeta}>The person behind the brand</div>
        <h2>
          Meet
          <br />
          <em>{name}.</em>
        </h2>
        {view.bio ? (
          <p>{view.bio}</p>
        ) : (
          <p>
            A dedicated real estate connection
            {view.markets[0] ? ` for the ${view.markets[0]}` : ""}. Your home, your goals and your
            next move deserve attention that feels genuinely personal.
          </p>
        )}
        <p>
          <strong>{view.brandName}</strong>
          {view.brokerage.name ? (
            <>
              <br />
              {view.brokerage.name}
            </>
          ) : null}
        </p>
        <div className={styles.aboutContact}>
          {view.phone ? <a href={`tel:${view.phone}`}>{view.phone}</a> : null}
          {view.email ? <a href={`mailto:${view.email}`}>{view.email}</a> : null}
        </div>
        <a className={`${styles.button} ${styles.buttonEmerald}`} href="#rc-contact" data-rc-allow="">
          Let&apos;s Connect ↗
        </a>
      </RoyalCollectionReveal>
    </section>
  );
}
