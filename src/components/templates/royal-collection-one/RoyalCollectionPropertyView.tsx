import type { ReactNode } from "react";
import { MlsDisclaimer } from "@/components/compliance/MlsDisclaimer";
import { RoyalCollectionPropertyGallery } from "./RoyalCollectionPropertyGallery";
import type {
  RoyalCollectionPropertyModel,
  RoyalCollectionPropertyRow,
} from "@/lib/tenancy/templates/royal-collection-property-model";
import styles from "./royal-property.module.css";

function phoneHref(phone: string): string {
  return "tel:" + phone.replace(/[^\d+]/g, "");
}

type FactTone = "price" | "stat" | "meta" | "identity";

function factTone(label: string): FactTone {
  switch (label) {
    case "Asking":
    case "Sold":
      return "price";
    case "Bedrooms":
    case "Bathrooms":
    case "Type":
    case "Interior":
      return "stat";
    case "Address":
    case "City":
      return "identity";
    case "MLS":
    case "Lot":
      return "meta";
    default:
      return "meta";
  }
}

function FactCell({ fact, tone }: { fact: RoyalCollectionPropertyRow; tone: Exclude<FactTone, "identity"> }) {
  const toneClass =
    tone === "price" ? styles.factPrice : tone === "stat" ? styles.factStat : styles.factMeta;
  return (
    <div className={toneClass}>
      <dt>{fact.label}</dt>
      <dd>{fact.value}</dd>
    </div>
  );
}

function ListingFacts({ facts }: { facts: readonly RoyalCollectionPropertyRow[] }) {
  const prices = facts.filter((fact) => factTone(fact.label) === "price");
  const stats = facts.filter((fact) => factTone(fact.label) === "stat");
  const meta = facts.filter((fact) => factTone(fact.label) === "meta");
  if (prices.length + stats.length + meta.length === 0) return null;
  return (
    <dl className={styles.listingFacts}>
      {prices.length > 0 ? (
        <div className={styles.priceRow}>
          {prices.map((fact) => (
            <FactCell key={fact.label} fact={fact} tone="price" />
          ))}
        </div>
      ) : null}
      {stats.length > 0 ? (
        <div className={styles.statGrid}>
          {stats.map((fact) => (
            <FactCell key={fact.label} fact={fact} tone="stat" />
          ))}
        </div>
      ) : null}
      {meta.length > 0 ? (
        <div className={styles.metaGrid}>
          {meta.map((fact) => (
            <FactCell key={fact.label} fact={fact} tone="meta" />
          ))}
        </div>
      ) : null}
    </dl>
  );
}

/**
 * Shared Royal Collection property layout.
 * Listing data is supplied by the caller. This component does not load a listing.
 */
export function RoyalCollectionPropertyView({
  model,
  children,
  notice,
  trailer,
  showDisclaimer = false,
}: {
  model: RoyalCollectionPropertyModel;
  children?: ReactNode;
  /** Staging harness label. Operational listings do not pass this. */
  notice?: ReactNode;
  /** Extra harness controls placed with the story, below the gallery. */
  trailer?: ReactNode;
  showDisclaimer?: boolean;
}) {
  return (
    <div className={styles.page}>
      <div className={styles.scroll}>
        {notice}
        {model.kind === "withheld" ? null : (
          <RoyalCollectionPropertyGallery
            frames={model.frames}
            presentation={model.kind === "concept" ? "concept" : "listing"}
          />
        )}

        <div className={styles.inner}>
          <header className={model.kind === "listing" ? `${styles.intro} ${styles.introListing}` : styles.intro}>
            <div className={styles.heading}>
              <div className={styles.kickerRow}>
                <p className={styles.kicker}>{model.kicker}</p>
                {model.badge ? <p className={styles.demoBadge}>{model.badge}</p> : null}
              </div>
              <h1>{model.title}</h1>
              {model.place ? <p className={styles.place}>{model.place}</p> : null}
            </div>
            {model.lede ? <p>{model.lede}</p> : null}
          </header>

          {model.kind === "listing" ? (
            <ListingFacts facts={model.facts} />
          ) : model.facts.length > 0 ? (
            <dl className={styles.facts}>
              {model.facts.map((fact) => (
                <div key={fact.label}>
                  <dt>{fact.label}</dt>
                  <dd>{fact.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          <div className={styles.stage}>
            <div className={styles.story}>
              {trailer}
              {model.overview ? (
                <section className={styles.block} aria-labelledby="rc-property-about">
                  <p className={styles.eyebrow}>{model.overview.eyebrow}</p>
                  <h2 id="rc-property-about">{model.overview.title}</h2>
                  {model.overview.paragraphs.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </section>
              ) : null}

              {model.highlights ? (
                <section className={styles.block} aria-labelledby="rc-property-highlights">
                  <p className={styles.eyebrow}>{model.highlights.eyebrow}</p>
                  <h2 id="rc-property-highlights">{model.highlights.title}</h2>
                  <ul className={styles.highlights}>
                    {model.highlights.items.map((item) => (
                      <li key={item.title}>
                        <strong>{item.title}</strong>
                        <span>{item.copy}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {model.rooms ? (
                <section className={styles.block} aria-labelledby="rc-property-rooms">
                  <p className={styles.eyebrow}>{model.rooms.eyebrow}</p>
                  <h2 id="rc-property-rooms">{model.rooms.title}</h2>
                  {model.rooms.intro ? <p>{model.rooms.intro}</p> : null}
                  {model.rooms.rows.length > 0 ? (
                    <dl className={styles.details}>
                      {model.rooms.rows.map((row) => (
                        <div key={row.label}>
                          <dt>{row.label}</dt>
                          <dd>{row.value}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                </section>
              ) : null}

              {model.outdoor ? (
                <section className={styles.block} aria-labelledby="rc-property-outdoor">
                  <p className={styles.eyebrow}>{model.outdoor.eyebrow}</p>
                  <h2 id="rc-property-outdoor">{model.outdoor.title}</h2>
                  {model.outdoor.paragraphs.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </section>
              ) : null}

              {model.location ? (
                <section className={styles.block} aria-labelledby="rc-property-location">
                  <p className={styles.eyebrow}>{model.location.eyebrow}</p>
                  <h2 id="rc-property-location">{model.location.title}</h2>
                  <div
                    className={styles.location}
                    role="img"
                    aria-label={model.location.label + ". " + model.location.note}
                  >
                    <span>{model.location.label}</span>
                    <strong>{model.location.detail}</strong>
                    <p>{model.location.note}</p>
                  </div>
                </section>
              ) : null}

              {model.extras ? (
                <section className={styles.block} aria-labelledby="rc-property-details">
                  <p className={styles.eyebrow}>{model.extras.eyebrow}</p>
                  <h2 id="rc-property-details">{model.extras.title}</h2>
                  <dl className={styles.details}>
                    {model.extras.rows.map((row) => (
                      <div key={row.label}>
                        <dt>{row.label}</dt>
                        <dd>{row.value}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ) : null}

              {model.related ? (
                <section className={styles.block} aria-labelledby="rc-property-related">
                  <p className={styles.eyebrow}>{model.related.eyebrow}</p>
                  <h2 id="rc-property-related">{model.related.title}</h2>
                  <ul className={styles.related}>
                    {model.related.cards.map((card) => (
                      <li key={card.title}>
                        <article>
                          {card.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={card.imageUrl} alt="" />
                          ) : (
                            <span className={styles.relatedEmpty} />
                          )}
                          <p>{card.kicker}</p>
                          <strong>{card.title}</strong>
                          <span>{card.note}</span>
                        </article>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {model.attribution ? (
                <section className={styles.block} aria-labelledby="rc-property-brokerage">
                  <p className={styles.eyebrow}>{model.attribution.eyebrow}</p>
                  <h2 id="rc-property-brokerage">{model.attribution.title}</h2>
                  {model.attribution.paragraphs.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                  {showDisclaimer ? <MlsDisclaimer /> : null}
                </section>
              ) : null}
            </div>

            <aside className={styles.aside} id="rc-contact" aria-label="Private viewing">
              <div className={styles.agentIdentity}>
                {model.contact.photoUrl ? (
                  // Approved workspace portrait. A cutout, so it sits on the navy ground.
                  <span className={styles.agentPhotoFrame}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      className={styles.agentPhoto}
                      src={model.contact.photoUrl}
                      alt=""
                    />
                  </span>
                ) : null}
                <div>
                  {model.contact.agentName ? (
                    <p className={styles.agent}>{model.contact.agentName}</p>
                  ) : null}
                  {model.contact.role ? (
                    <p className={styles.agentRole}>{model.contact.role}</p>
                  ) : null}
                  {model.contact.brokerageName ? (
                    <p className={styles.asideCopy}>{model.contact.brokerageName}</p>
                  ) : null}
                  {model.contact.phone ? (
                    <p className={styles.contact}>
                      <a href={phoneHref(model.contact.phone)}>{model.contact.phone}</a>
                    </p>
                  ) : null}
                </div>
              </div>
              <p className={styles.eyebrow}>{model.contact.eyebrow}</p>
              <h2>{model.contact.title}</h2>
              {children}
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}
