import Link from "next/link";
import type { RoyalCollectionView } from "@/lib/tenancy/templates/resolve-royal-collection-view";
import styles from "./home-buying-guide.module.css";

const STEPS = [
  { href: "#ready", label: "01 Ready" },
  { href: "#numbers", label: "02 Numbers" },
  { href: "#mortgage", label: "03 Mortgage" },
  { href: "#home", label: "04 The home" },
  { href: "#offer", label: "05 The offer" },
  { href: "#after", label: "06 After" },
] as const;

function HouseMark() {
  return (
    <svg className={styles.heroMark} viewBox="0 0 280 220" aria-hidden="true">
      <path
        d="M40 108 L140 28 L240 108"
        fill="none"
        stroke="#c8a66a"
        strokeWidth="2"
      />
      <rect x="62" y="108" width="156" height="84" fill="none" stroke="#f7f4ee" strokeWidth="1.5" />
      <rect x="122" y="146" width="36" height="46" fill="none" stroke="#c8a66a" strokeWidth="1.5" />
      <path d="M78 108 V78 H108 V108" fill="none" stroke="#c8a66a" strokeWidth="1.5" />
    </svg>
  );
}

export function RoyalCollectionHomeBuyingGuide({
  view,
}: {
  view: RoyalCollectionView;
}) {
  const first = view.firstName || "Saad";
  const phone = view.phone;
  const email = view.email;

  return (
    <article className={styles.guide}>
      <header className={styles.hero}>
        <p className={styles.kicker}>
          {view.brandName}
          {view.markets[0] ? ` · ${view.markets[0]}` : ""}
        </p>
        <h1>
          Step by step
          <br />
          <em>home buying</em> guide.
        </h1>
        <p className={styles.lede}>
          A clear path from the first question to the keys. {first} walks Niagara
          buyers through the same sequence used across Canada: decide, measure
          what you can carry, arrange the mortgage, choose the home, then close
          with care.
        </p>
        <HouseMark />
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

      <section className={styles.chapter} id="ready">
        <div className={styles.chapterHead}>
          <span className={styles.index}>01</span>
          <h2>Is owning the right move?</h2>
        </div>
        <p className={styles.intro}>
          A home is a place to live and a long financial commitment. Before you
          tour, be honest about stability, the time you can give to upkeep, and
          whether you want the freedom of owning or the flexibility of renting.
        </p>
        <div className={styles.split}>
          <div className={styles.panel}>
            <h3>Owning</h3>
            <p className={styles.pros}>In your favour</p>
            <ul>
              <li>You decide on paint, renovations, and how the place is used.</li>
              <li>Each payment builds equity instead of rent.</li>
              <li>A secondary suite can offset part of the carrying cost.</li>
            </ul>
            <p className={styles.cons}>The weight</p>
            <ul>
              <li>You carry the mortgage, taxes, insurance, and every repair.</li>
              <li>A higher rate at renewal can lift the payment.</li>
              <li>Value can fall between the day you buy and the day you sell.</li>
            </ul>
          </div>
          <div className={styles.panel}>
            <h3>Renting</h3>
            <p className={styles.pros}>In your favour</p>
            <ul>
              <li>Fewer repairs, and a smaller amount due up front.</li>
              <li>Easier to change neighbourhoods or cities.</li>
              <li>Cash can stay invested while you save a larger down payment.</li>
            </ul>
            <p className={styles.cons}>The weight</p>
            <ul>
              <li>Rent can rise, and a lease may not be renewed.</li>
              <li>Payments build the owner’s equity, not yours.</li>
              <li>Changes to the home need the landlord’s agreement.</li>
            </ul>
          </div>
        </div>
        <div className={styles.grid}>
          <div className={styles.card}>
            <small>Up front</small>
            <h3>The cash to get in</h3>
            <p>Down payment, closing costs, and any tax due on a new build or on mortgage insurance.</p>
          </div>
          <div className={styles.card}>
            <small>Every month</small>
            <h3>The cost of staying</h3>
            <p>Mortgage, property tax, insurance, heat, condo fees where they apply, and ordinary upkeep.</p>
          </div>
          <div className={styles.card}>
            <small>Later</small>
            <h3>The large repairs</h3>
            <p>Roofs, foundations, and systems arrive on their own schedule. Homes off municipal water or sewer cost more to maintain.</p>
          </div>
        </div>
      </section>

      <section className={`${styles.chapter} ${styles.chapterNavy}`} id="numbers">
        <div className={styles.chapterHead}>
          <span className={styles.index}>02</span>
          <h2>What can you actually carry?</h2>
        </div>
        <p className={styles.intro}>
          Start with what leaves the household each month, then subtract it from
          take-home pay. What remains is the room you have. Lenders then test
          the purchase against two long-standing ratios.
        </p>
        <div className={styles.ratios}>
          <div className={styles.ratio}>
            <strong>32%</strong>
            <span>Housing costs</span>
            <p>
              A common guide is to keep mortgage, property tax, heat, and half
              of any condo or association fees within 32% of gross monthly
              income. For an insured mortgage, CMHC’s limit is higher, at 39%.
            </p>
          </div>
          <div className={styles.ratio}>
            <strong>40%</strong>
            <span>All debts together</span>
            <p>
              Housing plus car loans, credit cards, lines of credit, and other
              mortgages should stay near 40% of gross income. CMHC’s insured
              limit is 44%.
            </p>
          </div>
        </div>
        <div className={styles.grid}>
          {[
            ["Down payment", "The portion you pay when the offer is accepted."],
            ["Inspection and appraisal", "Independent eyes on condition and value."],
            ["Insurance", "The home itself, and mortgage insurance if the down payment is under 20%."],
            ["Land transfer and legal", "In Ontario, budget for land transfer tax and your lawyer."],
            ["Adjustments", "You may reimburse the seller for taxes or utilities already paid."],
            ["Move and first repairs", "Trucks, paint, and anything the inspection says should not wait."],
          ].map(([title, body]) => (
            <div className={styles.card} key={title}>
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
          ))}
        </div>
        <p className={styles.intro}>
          First-time buyers can ask about the Home Buyers’ Plan and the First
          Home Savings Account, and about the GST/HST new-housing rebate on a
          newly built home. If the ratios do not fit, pay down debt, widen the
          savings window, or look in a lower price range before you fall in
          love with a house.
        </p>
      </section>

      <section className={styles.chapter} id="mortgage">
        <div className={styles.chapterHead}>
          <span className={styles.index}>03</span>
          <h2>Arrange the mortgage first.</h2>
        </div>
        <p className={styles.intro}>
          A pre-approval tells you a likely rate, payment, and price range so
          the search stays honest. It is not a final yes. The lender still has
          to accept the house, the price, and the condition.
        </p>
        <dl className={styles.defs}>
          <div>
            <dt>Amortization</dt>
            <dd>How long you take to pay the loan off, often 25 years, if every payment is made.</dd>
          </div>
          <div>
            <dt>Term</dt>
            <dd>How long this rate and these options last, from six months to ten years. Then you renew.</dd>
          </div>
          <div>
            <dt>Fixed, variable, capped</dt>
            <dd>The rate can stay still, move with the market, or move only up to a ceiling.</dd>
          </div>
          <div>
            <dt>Open or closed</dt>
            <dd>Open loans can be paid off early. Closed loans usually cost less and limit extra payments.</dd>
          </div>
          <div>
            <dt>Down payment</dt>
            <dd>
              The usual minimum is 5% on the first $500,000 of price and 10% on
              the rest. Twenty percent or more is a conventional mortgage.
              Less than that is high-ratio and generally needs mortgage insurance.
            </dd>
          </div>
          <div>
            <dt>Stress test</dt>
            <dd>
              Federally regulated lenders qualify you at a rate higher than the
              contract rate, so a rise later does not break the payment.
            </dd>
          </div>
        </dl>
        <div className={styles.grid}>
          <div className={styles.card}>
            <small>Bring</small>
            <h3>The file</h3>
            <p>Photo ID, address and job history, income, savings, the source of the down payment, and a list of debts.</p>
          </div>
          <div className={styles.card}>
            <small>Check</small>
            <h3>Your credit</h3>
            <p>Read the report before the lender does. Errors are easier to fix before an application.</p>
          </div>
          <div className={styles.card}>
            <small>Leave room</small>
            <h3>Borrow less than the max</h3>
            <p>A smaller loan, or faster payments, is how you stay standing if income dips or rates rise.</p>
          </div>
        </div>
      </section>

      <section className={`${styles.chapter} ${styles.chapterNavy}`} id="home">
        <div className={styles.chapterHead}>
          <span className={styles.index}>04</span>
          <h2>Choose a home for the next decade.</h2>
        </div>
        <p className={styles.intro}>
          {first} will help you test Niagara towns against how you actually
          live: the drive, the schools, the winter, and the room you will still
          want in five years.
        </p>
        <div className={styles.grid}>
          {[
            ["Place", "Falls, the lake, St. Catharines, or a quieter town. Walkable, or worth the drive."],
            ["Size", "Beds, baths, a room to work, storage, and whether a garage is essential."],
            ["The building", "New, resale, or a build. Energy use, allergies, and what will need replacing."],
            ["The life", "Children, retirement, family nearby, a park, or a lock on the evening walk."],
            ["Freehold", "You own the house and the land, and you maintain both."],
            ["Condo or co-op", "A condo shares common property and fees. A co-op is a share in the building and usually needs 20% down."],
          ].map(([title, body]) => (
            <div className={styles.card} key={title}>
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
          ))}
        </div>
        <p className={styles.intro}>
          The useful team is small: {first} for the search and the offer, a
          lender or broker, a home inspector, an insurance broker, and a
          lawyer. An appraiser, surveyor, or builder joins only when the
          property needs them. Ask for qualifications, and never sign what you
          have not read.
        </p>
      </section>

      <section className={styles.chapter} id="offer">
        <div className={styles.chapterHead}>
          <span className={styles.index}>05</span>
          <h2>Make the offer. Then close.</h2>
        </div>
        <p className={styles.intro}>
          An agreement of purchase and sale is a contract. {first} and your
          lawyer prepare it. Expect a negotiation. The deal is final only when
          every condition is met.
        </p>
        <ul className={styles.plainList}>
          <li>Names, the property, and the price you are offering.</li>
          <li>The deposit, and any appliances or window coverings you want included.</li>
          <li>A closing date, often 30 to 60 days out, longer if the home is still being built.</li>
          <li>Conditions for a satisfactory inspection and for financing.</li>
          <li>The day the offer expires.</li>
        </ul>
        <div className={styles.grid}>
          <div className={styles.card}>
            <small>After they accept</small>
            <h3>Return to the lender</h3>
            <p>Take the signed offer, the listing, the inspection, taxes, utilities, and any condo fees.</p>
          </div>
          <div className={styles.card}>
            <small>Closing day</small>
            <h3>The lawyer’s table</h3>
            <p>
              The lender sends the mortgage funds. You bring the rest of the
              down payment and closing costs, often about 1.5% to 4% of the price.
            </p>
          </div>
          <div className={styles.card}>
            <small>Then</small>
            <h3>Keys, and a new address</h3>
            <p>The home is registered in your name. Tell the people and offices that still have the old one.</p>
          </div>
        </div>
      </section>

      <section className={`${styles.chapter} ${styles.chapterNavy}`} id="after">
        <div className={styles.chapterHead}>
          <span className={styles.index}>06</span>
          <h2>Keep the house, and the budget.</h2>
        </div>
        <div className={styles.grid}>
          {[
            ["Pay on time", "Weekly, biweekly, or monthly. A missed payment hits both the fee and the credit file. Call the lender early if money gets tight."],
            ["Run the house", "Heat, snow, the garden, and the small repairs sit beside the mortgage and the tax bill. Condo fees may cover some of this."],
            ["Hold a reserve", "A useful habit is to set aside about 5% of yearly income for the repair you did not schedule."],
            ["Improve with a limit", "Comfort and lower bills are worth doing. Renovations priced for a different neighbourhood rarely come back in full."],
          ].map(([title, body]) => (
            <div className={styles.card} key={title}>
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
          ))}
        </div>
        <div className={styles.actions}>
          <Link className={styles.gold} href="/search?transactionType=SALE">
            Explore homes
          </Link>
          <Link className={styles.ghost} href="/contact">
            Talk with {first}
          </Link>
          {phone ? (
            <a className={styles.ghost} href={`tel:${phone}`}>
              {phone}
            </a>
          ) : null}
          {email ? (
            <a className={styles.ghost} href={`mailto:${email}`}>
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
        The sequence
        follows the public homebuying steps published by the Canada Mortgage
        and Housing Corporation. Ratios, down payments, and programs change.
        This page is general information, not mortgage, legal, or tax advice.
        Confirm the figures with your lender and lawyer.{" "}
        <a href="https://www.cmhc-schl.gc.ca/consumers/home-buying/homebuying-step-by-step-guide">
          CMHC homebuying guide
        </a>
        .
      </p>
    </article>
  );
}
