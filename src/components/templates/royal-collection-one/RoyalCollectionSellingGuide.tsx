import Link from "next/link";
import type { RoyalCollectionView } from "@/lib/tenancy/templates/resolve-royal-collection-view";
import styles from "./home-buying-guide.module.css";

const STEPS = [
  { href: "#prepare", label: "01 Prepare" },
  { href: "#price", label: "02 Price" },
  { href: "#campaign", label: "03 Campaign" },
  { href: "#offers", label: "04 Offers" },
  { href: "#close", label: "05 Close" },
] as const;

const KITCHEN = "/media/royal-collection/high-octane/itso-demo-1001/03-kitchen.webp";
const LIVING = "/media/royal-collection/high-octane/luxury-interior-poster.jpg";

export function RoyalCollectionSellingGuide({
  view,
}: {
  view: RoyalCollectionView;
}) {
  const first = view.firstName || "Saad";
  const phone = view.phone;
  const email = view.email;
  const exterior = view.valuationImageUrl;
  const curb = view.storyMainUrl;
  const portrait = view.resolvedAgentPortraitUrl;

  return (
    <article className={styles.guide}>
      <header className={styles.hero}>
        <div className={styles.heroGrid}>
          <div>
            <p className={styles.kicker}>
              {view.brandName}
              {view.markets[0] ? ` · ${view.markets[0]}` : ""}
            </p>
            <h1>
              Preparing to sell
              <br />
              <em>with confidence.</em>
            </h1>
            <p className={styles.lede}>
              {first} prepares Niagara homes in a set order: the house itself,
              a price the street will support, a campaign buyers actually see,
              and a close that does not unravel in the last week.
            </p>
          </div>
          {exterior ? (
            <figure className={styles.heroStill}>
              <img src={exterior} alt="A finished stone house, lawn, and planted approach" />
              <figcaption className={styles.stillCaption}>The street decides first</figcaption>
            </figure>
          ) : null}
        </div>
      </header>

      <div className={styles.railWrap}>
        <nav className={styles.rail} aria-label="Guide steps">
          {STEPS.map((step) => (
            <a key={step.href} href={step.href}>
              {step.label}
            </a>
          ))}
        </nav>
      </div>

      <section className={styles.chapter} id="prepare">
        <div className={styles.chapterHead}>
          <span className={styles.index}>01</span>
          <h2>Make the house easy to want.</h2>
        </div>
        <p className={styles.intro}>
          Buyers are picturing their own life, not the one already in the
          frames. {first} starts with what should leave, what should be
          repaired, and how the rooms should read in a photograph.
        </p>
        <div className={styles.frames}>
          <figure className={styles.frame}>
            <img
              src={LIVING}
              alt="A bright living room staged in quiet neutrals, with the garden beyond the glass"
            />
            <figcaption className={styles.stillCaption}>One job per room</figcaption>
          </figure>
          <figure className={styles.frame}>
            <img
              src={KITCHEN}
              alt="A cleared kitchen island, marble, and warm light over the counters"
            />
            <figcaption className={styles.stillCaption}>Clear the counters</figcaption>
          </figure>
        </div>
        <div className={styles.grid}>
          <div className={styles.card}>
            <small>Rooms</small>
            <h3>Take the personal out</h3>
            <p>
              Family photographs, extra chairs, and the pieces you will keep
              belong in storage for the weeks of showings. What stays should
              show how the room is used.
            </p>
          </div>
          <div className={styles.card}>
            <small>Condition</small>
            <h3>Fix what a buyer will touch</h3>
            <p>
              Drips, dark bulbs, scuffed walls, and cloudy glass read as
              neglect. A short repair list before the first visit costs less
              than a price cut later.
            </p>
          </div>
          <div className={styles.card}>
            <small>Arrival</small>
            <h3>The walk from the car</h3>
            <p>
              Cut the lawn, edge the beds, wash the approach, and give the
              front door a clean finish. That first minute sets the number
              they carry inside.
            </p>
          </div>
        </div>
        {curb ? (
          <div className={styles.frames}>
            <figure className={styles.frame}>
              <img src={curb} alt="Cedar shingles, white trim, and a round window on a Niagara house" />
              <figcaption className={styles.stillCaption}>Curb is part of the price</figcaption>
            </figure>
            <div className={styles.card}>
              <small>Staging</small>
              <h3>Quiet colour, honest light</h3>
              <p>
                Furniture pulled back makes a room feel larger. Neutral cloth
                and a few living stems do more than a theme. When a house
                needs a fuller hand, {first} brings in a stager before the
                camera, not after the first quiet weekend.
              </p>
            </div>
          </div>
        ) : null}
      </section>

      <section className={`${styles.chapter} ${styles.chapterNavy}`} id="price">
        <div className={styles.chapterHead}>
          <span className={styles.index}>02</span>
          <h2>Price the house the market can see.</h2>
        </div>
        <p className={styles.intro}>
          Attachment is normal. It is a poor appraiser. {first} builds the
          range from recent Niagara sales of similar size, condition, and
          street, then adjusts for what your house has that those did not.
        </p>
        <div className={styles.grid}>
          {[
            ["Recent sales", "Look at what actually closed, how long it took, and whether the last price was the list price."],
            ["An outside opinion", "A formal appraisal helps when the house is unusual, or when the street has been quiet."],
            ["This season", "A crowded listing week and a higher rate ask for a different number than a thin spring."],
            ["The honest condition", "A new roof supports a price. A roof the buyer will replace does not."],
            ["A little under", "Sitting just beneath the obvious comps can bring more than one offer."],
            ["A rare house", "A view, a lot, or a finished suite can hold the top of the range. Ordinary houses cannot."],
          ].map(([title, body]) => (
            <div className={styles.card} key={title}>
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
          ))}
        </div>
        <div className={styles.actions}>
          <Link className={styles.gold} href="/home-valuation">
            Request a valuation
          </Link>
          <Link className={styles.ghost} href="/contact">
            Price it with {first}
          </Link>
        </div>
      </section>

      <section className={styles.chapter} id="campaign">
        <div className={styles.chapterHead}>
          <span className={styles.index}>03</span>
          <h2>Show it where buyers already look.</h2>
        </div>
        <p className={styles.intro}>
          The listing is the first showing. {first} writes it around what is
          actually distinctive, then photographs the house in the light it
          deserves and puts that file where Niagara buyers search.
        </p>
        <div className={styles.grid}>
          <div className={styles.card}>
            <small>The file</small>
            <h3>Words and pictures</h3>
            <p>
              A short description of the rooms, the lot, and the walk to daily
              life. Photographs taken for the architecture, plus a tour for
              the buyer who cannot come this weekend.
            </p>
          </div>
          <div className={styles.card}>
            <small>The reach</small>
            <h3>The boards, and the people</h3>
            <p>
              The listing goes to the MLS and the sites buyers open at night.
              {first} also takes it to buyers already working with this
              practice, and to the agents who sell this part of Niagara.
            </p>
          </div>
          <div className={styles.card}>
            <small>The visit</small>
            <h3>Open the door on purpose</h3>
            <p>
              Weekend and early-evening times, a house that is already staged,
              and a short note on the neighbourhood. Refreshments are optional.
              A clear path through every room is not.
            </p>
          </div>
        </div>
        {portrait ? (
          <div className={styles.agent}>
            <div className={styles.agentPlate}>
              <img src={portrait} alt={`${view.agentName || first}, real estate agent`} />
            </div>
            <div>
              <p className={styles.kicker}>Your agent</p>
              <h3>The campaign has a person on it.</h3>
              <p>
                {view.brokerage.name
                  ? `${view.agentName || first} works through ${view.brokerage.name}.`
                  : `${view.agentName || first}.`}{" "}
                Pricing, the photographs, the open house, and the negotiation
                stay with one person who knows which offer is actually strong.
              </p>
              <div className={styles.actions}>
                <Link className={styles.gold} href="/contact">
                  Plan the sale
                </Link>
                {phone ? (
                  <a className={`${styles.ghost} ${styles.ghostInk}`} href={`tel:${phone.replace(/[^\d+]/g, "")}`}>
                    {phone}
                  </a>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <section className={`${styles.chapter} ${styles.chapterNavy}`} id="offers">
        <div className={styles.chapterHead}>
          <span className={styles.index}>04</span>
          <h2>Read the offer. Then answer it.</h2>
        </div>
        <p className={styles.intro}>
          The highest number is not always the offer to take. {first} lines
          the proposals up beside deposit, financing, conditions, and the day
          you need to be out.
        </p>
        <ul className={styles.plainList}>
          <li>Price, deposit, and what is included: appliances, window coverings, the fixtures you meant to keep.</li>
          <li>Financing that is already in motion, and conditions you can live with.</li>
          <li>A closing date that matches the next house, or the time you need to move.</li>
          <li>A counter that names a reason: the comps, the work you have done, or a term you cannot move.</li>
        </ul>
        <div className={styles.grid}>
          <div className={styles.card}>
            <small>After you accept</small>
            <h3>Inspection and appraisal</h3>
            <p>
              A buyer’s inspection can come back with a repair request. An
              appraisal can come back under the price. {first} sorts what is
              fair to address and what should stay with the buyer.
            </p>
          </div>
          <div className={styles.card}>
            <small>The last walk</small>
            <h3>The house you agreed to sell</h3>
            <p>
              The final visit is to confirm the condition and the inclusions,
              not to reopen the price. Keep the same standard you showed on
              day one.
            </p>
          </div>
          <div className={styles.card}>
            <small>Your lawyer</small>
            <h3>Sign only what you understand</h3>
            <p>
              The lawyer reviews the documents, the payout of any mortgage,
              and the funds. Keys move when that work is finished, not before.
            </p>
          </div>
        </div>
      </section>

      <section className={styles.chapter} id="close">
        <div className={styles.chapterHead}>
          <span className={styles.index}>05</span>
          <h2>Then the next chapter.</h2>
        </div>
        <p className={styles.intro}>
          A sale that holds together is mostly preparation: a house that
          shows well, a price with evidence, and answers that come back the
          same day. {first} stays on the file from the first valuation
          through the day the lawyer releases the keys.
        </p>
        <div className={styles.actions}>
          <Link className={styles.gold} href="/home-valuation">
            Start with a valuation
          </Link>
          <Link className={`${styles.ghost} ${styles.ghostInk}`} href="/contact">
            Talk with {first}
          </Link>
          {phone ? (
            <a className={`${styles.ghost} ${styles.ghostInk}`} href={`tel:${phone.replace(/[^\d+]/g, "")}`}>
              {phone}
            </a>
          ) : null}
          {email ? (
            <a className={`${styles.ghost} ${styles.ghostInk}`} href={`mailto:${email}`}>
              {email}
            </a>
          ) : null}
        </div>
      </section>

      <p className={styles.source}>
        Prepared for clients of{" "}
        {view.brokerage.name
          ? `${view.brandName}, ${view.brokerage.name}.`
          : `${view.brandName}.`}{" "}
        A practical briefing on preparing, pricing, and selling a home in
        Niagara. It is not a promise of price, timing, or terms, and it is
        not legal advice. Confirm the number, the conditions, and the
        documents with {first} and your lawyer.
      </p>
    </article>
  );
}
