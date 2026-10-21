import { HIGH_OCTANE_PREVIEW_FIXTURE } from "@/lib/tenancy/templates/high-octane-preview-fixture";
import { ROYAL_COLLECTION_PREVIEW_ACTION_NOTE } from "./preview-action-note";
import styles from "./royal-property.module.css";

/**
 * Development-only property detail demonstration.
 * No listing record, gallery API, registration gate, or lead action is mounted.
 */
const FACTS = [
  ["Region", "Niagara Region"],
  ["Residence", "Concept"],
  ["Bedrooms", "—"],
  ["Bathrooms", "—"],
  ["Interior", "—"],
  ["Offering", "Concept"],
] as const;

const HIGHLIGHTS = [
  ["Arrival", "A composed approach, drawn as architecture rather than a listing photo."],
  ["Light", "Tall openings suggested by proportion, not by a recorded room."],
  ["Garden", "An outdoor room in the plan, with no claimed lot or address."],
  ["Privacy", "A quiet sequence of rooms for the design study only."],
] as const;

const AMENITIES = [
  "Principal rooms",
  "Garden aspect",
  "Evening light",
  "Quiet arrival",
  "Study",
  "Hearth",
] as const;

export function RoyalCollectionPropertyDemonstration() {
  const fixture = HIGH_OCTANE_PREVIEW_FIXTURE;

  return (
    <div className={styles.page}>
      <div className={styles.scroll}>
        <section className={styles.gallery} aria-label="Concept gallery">
          <div className={styles.galleryArt} aria-hidden="true">
            <div className={styles.mass} />
            <div className={styles.wing} />
            <div className={styles.court} />
            <div className={styles.opening} />
            <div className={styles.horizon} />
          </div>
          <div className={styles.galleryCaption}>
            <p>Concept gallery</p>
            <strong>Not a photograph of a listing.</strong>
            <span>
              An architectural study in navy, emerald, and gold. This panel
              does not load property photos.
            </span>
          </div>
        </section>

        <div className={styles.inner}>
          <header className={styles.intro}>
            <div>
              <p className={styles.kicker}>Design Concept — Not an MLS Listing</p>
              <h1>The residence.</h1>
            </div>
            <p>
              A design preview of a luxury property page. These rooms, facts,
              and the viewing panel are concepts. They are not a connected
              listing.
            </p>
          </header>

          <dl className={styles.facts}>
            {FACTS.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>

          <div className={styles.stage}>
            <div className={styles.story}>
              <section className={styles.block} aria-labelledby="rc-property-about">
                <p className={styles.eyebrow}>About the residence</p>
                <h2 id="rc-property-about">Composed for a first impression.</h2>
                <p>
                  The page is arranged the way a Royal Collection listing would
                  be read: a wide gallery, the price and place given room to
                  breathe, then the story of the house. Nothing here is taken
                  from a board, a saved search, or a workspace record.
                </p>
                <p>
                  Niagara Region is the market named in this preview. There is
                  no street, no board identifier, and no asking figure.
                </p>
              </section>

              <section className={styles.block} aria-labelledby="rc-property-highlights">
                <p className={styles.eyebrow}>Architectural highlights</p>
                <h2 id="rc-property-highlights">Studies, not specifications.</h2>
                <ul className={styles.highlights}>
                  {HIGHLIGHTS.map(([title, copy]) => (
                    <li key={title}>
                      <strong>{title}</strong>
                      <span>{copy}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className={styles.block} aria-labelledby="rc-property-amenities">
                <p className={styles.eyebrow}>Amenities</p>
                <h2 id="rc-property-amenities">A palette of rooms.</h2>
                <ul className={styles.amenities}>
                  {AMENITIES.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>
            </div>

            <aside className={styles.aside} aria-label="Concept private viewing">
              <p className={styles.eyebrow}>Private viewing</p>
              <h2>Request a private viewing</h2>
              <p className={styles.asideCopy}>
                {fixture.agentName} · {fixture.brandName}
              </p>
              <p className={styles.asideCopy}>{fixture.brokerageName}</p>
              <p className={styles.contact}>
                <span>{fixture.phone}</span>
                <span>{fixture.email}</span>
              </p>
              <button type="button" className={styles.viewing} disabled aria-disabled="true">
                Request a private viewing
              </button>
              <p className={styles.note}>{ROYAL_COLLECTION_PREVIEW_ACTION_NOTE}</p>
              <p className={styles.asideFine}>
                This control does not book, save, chat, or send an inquiry.
              </p>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}
