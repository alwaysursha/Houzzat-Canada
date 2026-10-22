import type { ReactNode } from "react";
import { MlsDisclaimer } from "@/components/compliance/MlsDisclaimer";
import { RoyalCollectionPropertyGallery } from "./RoyalCollectionPropertyGallery";
import type { RoyalCollectionPropertyModel } from "@/lib/tenancy/templates/royal-collection-property-model";
import styles from "./royal-property.module.css";

function phoneHref(phone: string): string {
  return "tel:" + phone.replace(/[^\d+]/g, "");
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
          <header className={styles.intro}>
            <div>
              <p className={styles.kicker}>{model.kicker}</p>
              <h1>{model.title}</h1>
              {model.place ? <p className={styles.place}>{model.place}</p> : null}
            </div>
            {model.lede ? <p>{model.lede}</p> : null}
          </header>

          {model.facts.length > 0 ? (
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
              <p className={styles.eyebrow}>{model.contact.eyebrow}</p>
              <h2>{model.contact.title}</h2>
              {model.contact.agentName ? <p className={styles.agent}>{model.contact.agentName}</p> : null}
              {model.contact.brandName ? <p className={styles.asideCopy}>{model.contact.brandName}</p> : null}
              {model.contact.brokerageName ? (
                <p className={styles.asideCopy}>{model.contact.brokerageName}</p>
              ) : null}
              {model.contact.phone || model.contact.email ? (
                <p className={styles.contact}>
                  {model.contact.phone ? (
                    <a href={phoneHref(model.contact.phone)}>{model.contact.phone}</a>
                  ) : null}
                  {model.contact.email ? (
                    <a href={"mailto:" + model.contact.email}>{model.contact.email}</a>
                  ) : null}
                </p>
              ) : null}
              {children}
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}
