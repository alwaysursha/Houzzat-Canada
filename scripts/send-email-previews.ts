/**
 * One-off: send sample renders of every email template to a review inbox.
 * Usage: pnpm exec tsx scripts/send-email-previews.ts
 */
import { config } from "dotenv";

config({ path: ".env.local" });

const TO = "alisyedrealtor@gmail.com";
const SITE = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://houzzat.com";

async function main() {
  const {
    renderAgentMessageEmail,
    renderJustListedEmail,
    renderNeighborhoodWeeklyEmail,
    renderNewsletterEmail,
    renderPasswordResetEmail,
    renderPriceReductionEmail,
    renderPropertyUpdateEmail,
    renderSavedSearchDigestEmail,
    renderShortlistEmail,
    renderSoldAlertEmail,
    renderVerifyEmail,
    renderWelcomeEmail,
  } = await import("../src/lib/email/templates");
  const { sendRenderedEmail } = await import("../src/lib/email/send");
  const { isResendConfigured } = await import("../src/lib/email/config");

  if (!isResendConfigured()) {
    console.error("RESEND_API_KEY missing");
    process.exit(1);
  }

  const unsub = `${SITE}/account/monitors`;
  const listing = `${SITE}/listing/W1234567`;
  const name = "Ali";
  const sampleListings = [
    {
      mlsNumber: "W1234567",
      addressLine: "123 Maple Avenue",
      city: "Toronto",
      priceLabel: "$1,099,000",
      metaLabel: "3+1 bed · 3 bath",
      bedsLabel: "3+1",
      bathsLabel: "3",
      sqftLabel: "2,100 sqft",
      isNew: true,
      imageUrl:
        "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=800&q=80",
      listingUrl: listing,
    },
    {
      mlsNumber: "W7654321",
      addressLine: "45 King Street West",
      city: "Mississauga",
      priceLabel: "$989,000",
      metaLabel: "2 bed · 2 bath",
      bedsLabel: "2",
      bathsLabel: "2",
      sqftLabel: "1,150 sqft",
      isNew: true,
      imageUrl:
        "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80",
      listingUrl: `${SITE}/listing/W7654321`,
    },
    {
      mlsNumber: "C1112223",
      addressLine: "88 Queen Street East",
      city: "Toronto",
      priceLabel: "$875,000",
      metaLabel: "3 bed · 2 bath",
      bedsLabel: "3",
      bathsLabel: "2",
      sqftLabel: "1,450 sqft",
      isNew: true,
      imageUrl:
        "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=800&q=80",
      listingUrl: `${SITE}/listing/C1112223`,
    },
  ];

  const previews: Array<{
    stream: "notify" | "alerts";
    rendered: ReturnType<typeof renderWelcomeEmail>;
  }> = [
    {
      stream: "notify",
      rendered: renderVerifyEmail({
        name,
        verifyUrl: `${SITE}/auth/verify-email?token=preview`,
      }),
    },
    {
      stream: "notify",
      rendered: renderWelcomeEmail({ name }),
    },
    {
      stream: "notify",
      rendered: renderPasswordResetEmail({
        name,
        resetUrl: `${SITE}/auth/reset-password?token=preview`,
      }),
    },
    {
      stream: "alerts",
      rendered: renderPriceReductionEmail({
        name,
        addressLine: "123 Maple Avenue",
        city: "Toronto",
        mlsNumber: "W1234567",
        oldPrice: 1_149_000,
        newPrice: 1_099_000,
        listingUrl: listing,
        unsubscribeUrl: unsub,
      }),
    },
    {
      stream: "alerts",
      rendered: renderSoldAlertEmail({
        name,
        addressLine: "45 King Street West",
        city: "Mississauga",
        mlsNumber: "W7654321",
        statusLabel: "Sold",
        priceLabel: "Sold for $989,000",
        listingUrl: listing,
        unsubscribeUrl: unsub,
      }),
    },
    {
      stream: "alerts",
      rendered: renderJustListedEmail({
        name,
        areaName: "Leslieville",
        addressLine: "88 Queen Street East",
        city: "Toronto",
        mlsNumber: "C1112223",
        price: 875_000,
        listingUrl: listing,
        unsubscribeUrl: unsub,
      }),
    },
    {
      stream: "alerts",
      rendered: renderPropertyUpdateEmail({
        name,
        title: "Update on a watched home",
        addressLine: "12 Harbour Street",
        city: "Toronto",
        mlsNumber: "C9988776",
        changes: [
          "Status changed: Active → Conditional",
          "Open house added: Sat 2–4pm",
        ],
        listingUrl: listing,
        unsubscribeUrl: unsub,
      }),
    },
    {
      stream: "notify",
      rendered: renderShortlistEmail({
        name,
        agentName: "Ali Syed",
        shareUrl: `${SITE}/shortlist/preview`,
        note: "Here are three options that fit the budget and commute you mentioned.",
        listingLines: [
          "123 Maple Ave, Toronto · $1,099,000 · 3+1 bed",
          "45 King St W, Mississauga · $989,000 · 2 bed",
          "88 Queen St E, Toronto · $875,000 · 3 bed",
        ],
      }),
    },
    {
      stream: "notify",
      rendered: renderAgentMessageEmail({
        name,
        subject: "Quick update on your home search",
        body: "I walked through two of the shortlist homes today.\n\nThe Maple Avenue property shows well — natural light is better than the photos. Happy to book a private showing this weekend if you want.",
      }),
    },
    {
      stream: "alerts",
      rendered: renderNewsletterEmail({
        name,
        subject: "This week in the GTA market",
        headline: "Spring inventory is picking up",
        bodyHtml: `
          <p style="margin:0 0 12px">New listings are up week-over-week in several midtown pockets, while average days on market stayed steady.</p>
          <p style="margin:0 0 12px">If you’re shopping, this is a good window to tour before the next wave of competition.</p>
        `,
        ctaUrl: `${SITE}/search`,
        ctaLabel: "Browse new listings",
        unsubscribeUrl: unsub,
      }),
    },
    {
      stream: "alerts",
      rendered: renderSavedSearchDigestEmail({
        name,
        searchName: "Leslieville homes",
        listings: sampleListings,
        searchUrl: `${SITE}/search?city=Toronto&community=Leslieville&status=ACTIVE&sort=newest`,
        unsubscribeUrl: unsub,
      }),
    },
    {
      stream: "alerts",
      rendered: renderNeighborhoodWeeklyEmail({
        name,
        homeLabel: "79 Grand Flats Trail",
        radiusKm: 2,
        newCount: 5,
        soldCount: 3,
        medianSoldLabel: "$1,025,000",
        newListings: sampleListings.slice(0, 2),
        soldListings: [
          {
            mlsNumber: "W5551111",
            addressLine: "12 Harbour Street",
            city: "Toronto",
            priceLabel: "Sold $1,050,000",
            metaLabel: "Waterfront",
            listingUrl: `${SITE}/listing/W5551111`,
          },
          {
            mlsNumber: "W5552222",
            addressLine: "90 Queen Street East",
            city: "Toronto",
            priceLabel: "Sold $899,000",
            metaLabel: "Leslieville",
            listingUrl: `${SITE}/listing/W5552222`,
          },
        ],
        ctaUrl: `${SITE}/owner`,
        unsubscribeUrl: unsub,
      }),
    },
  ];

  for (const item of previews) {
    const rendered = {
      ...item.rendered,
      subject: `[Preview] ${item.rendered.subject}`,
    };
    const result = await sendRenderedEmail({
      to: TO,
      rendered,
      stream: item.stream,
    });
    console.log(rendered.kind, result);
    // Gentle pacing for Resend rate limits
    await new Promise((r) => setTimeout(r, 400));
  }

  console.log(`Done — ${previews.length} previews sent to ${TO}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
