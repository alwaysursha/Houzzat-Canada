import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocument } from "@/components/site/LegalDocument";
import { SITE_NAME, SITE_URL } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: `Terms governing use of ${SITE_NAME} websites and mobile apps.`,
  alternates: { canonical: `${SITE_URL}/terms` },
};

export default function TermsPage() {
  return (
    <LegalDocument title="Terms of Use" updated="August 8, 2026">
      <p>
        These Terms of Use (“Terms”) govern your access to and use of{" "}
        <strong>{SITE_NAME}</strong> websites, mobile applications, and related
        services (the “Services”). By using the Services, creating an account,
        or clicking to accept these Terms, you agree to be bound by them.
      </p>
      <p>
        If you do not agree, do not use the Services. For privacy practices, see
        our <Link href="/privacy">Privacy Policy</Link>.
      </p>

      <h2>1. About {SITE_NAME}</h2>
      <p>
        {SITE_NAME} provides online real estate search, alerts, saved homes,
        neighbourhood tools, and ways to connect with licensed real estate
        professionals. Brokerage services are provided through Royal LePage
        Credit Valley Real Estate and its registrants, subject to applicable
        real estate law and brokerage policies.
      </p>
      <p>
        Contact:{" "}
        <a href="mailto:notify@houzzat.com">notify@houzzat.com</a> · 647-221-4949
        · 1-10045 Hurontario St., Brampton, ON L6Z 0E6
      </p>

      <h2>2. Eligibility and accounts</h2>
      <ul>
        <li>You must be able to form a binding contract under Ontario/Canadian law.</li>
        <li>
          You are responsible for accurate registration details and for keeping
          your login credentials secure.
        </li>
        <li>
          Creating an account may register you as a {SITE_NAME} client for
          Virtual Office Website (VOW) access to certain sold/leased and history
          data, as required by board rules.
        </li>
      </ul>

      <h2>3. MLS® listing data (IDX / VOW)</h2>
      <p>
        Listing content is provided via TRREB / PropTx and other board data
        feeds. MLS® data is for your personal, non-commercial use in connection
        with a bona fide interest in the purchase, sale, or lease of real
        property. You must not:
      </p>
      <ul>
        <li>Scrape, bulk-download, republish, or commercially exploit listing data</li>
        <li>Remove proprietary notices or misuse VOW/IDX restricted information</li>
        <li>Share sold/leased prices or history obtained via VOW with the public</li>
      </ul>
      <p>
        Listing information is believed reliable but is not guaranteed.
        Verify all details independently before making decisions.
      </p>

      <h2>4. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Use the Services for unlawful, abusive, or fraudulent purposes</li>
        <li>Interfere with security, rate limits, or other users’ access</li>
        <li>Impersonate others or misrepresent your affiliation</li>
        <li>
          Reverse engineer or attempt unauthorized access to non-public systems
        </li>
        <li>Use automated bots except as expressly allowed by us</li>
      </ul>

      <h2>5. Alerts, communications, and mobile apps</h2>
      <p>
        By creating an account or enabling watches/alerts, you consent to receive
        email, phone/SMS, and push notifications related to your home search and
        account, as described at signup and in our Privacy Policy. You can manage
        many preferences in your account or device settings. Message/data rates
        may apply for SMS.
      </p>
      <p>
        Mobile app features (including push notifications and biometric unlock)
        require compatible devices and your permission. Biometric data stays on
        your device; we use it only to confirm unlock where you enable it.
      </p>

      <h2>6. No real estate advice guarantee</h2>
      <p>
        Content on the Services (including valuations, market insights,
        affordability tools, and neighbourhood information) is for general
        informational purposes only. It is not an appraisal, legal, tax, or
        mortgage advice, and not a guarantee of value, financing, or transaction
        outcomes. Always consult a licensed professional for advice specific to
        your situation.
      </p>

      <h2>7. Third-party services</h2>
      <p>
        The Services may link to maps, payment, authentication, partner, or other
        third-party tools. Those services have their own terms and privacy
        policies. We are not responsible for third-party content or practices.
      </p>

      <h2>8. Intellectual property</h2>
      <p>
        {SITE_NAME} branding, software, and original content are owned by us or
        our licensors. MLS® trademarks and listing content remain the property of
        their respective owners. You receive a limited, revocable license to use
        the Services for personal real-estate research.
      </p>

      <h2>9. Disclaimer of warranties</h2>
      <p>
        THE SERVICES ARE PROVIDED “AS IS” AND “AS AVAILABLE” WITHOUT WARRANTIES
        OF ANY KIND, WHETHER EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY,
        FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT, TO THE MAXIMUM
        EXTENT PERMITTED BY LAW.
      </p>

      <h2>10. Limitation of liability</h2>
      <p>
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, {SITE_NAME.toUpperCase()} AND ITS
        AFFILIATES, BROKERAGE, AGENTS, AND SUPPLIERS WILL NOT BE LIABLE FOR
        INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY
        LOSS OF PROFITS, DATA, OR GOODWILL, ARISING FROM YOUR USE OF THE
        SERVICES. OUR TOTAL LIABILITY FOR ANY CLAIM RELATING TO THE SERVICES WILL
        NOT EXCEED THE GREATER OF CAD $100 OR THE AMOUNTS YOU PAID US FOR THE
        SERVICES IN THE 12 MONTHS BEFORE THE CLAIM.
      </p>

      <h2>11. Indemnity</h2>
      <p>
        You agree to indemnify and hold harmless {SITE_NAME}, the brokerage, and
        their personnel from claims arising out of your misuse of the Services,
        your breach of these Terms, or your violation of law or third-party
        rights.
      </p>

      <h2>12. Suspension and termination</h2>
      <p>
        We may suspend or terminate access if you breach these Terms, misuse MLS®
        data, create security risk, or as required by law or board rules. You may
        stop using the Services at any time and may request account closure by
        contacting us.
      </p>

      <h2>13. Changes to the Terms</h2>
      <p>
        We may update these Terms from time to time. The “Last updated” date will
        change when we do. Material changes may be communicated in-product or by
        email. Continued use after changes means you accept the updated Terms.
      </p>

      <h2>14. Governing law</h2>
      <p>
        These Terms are governed by the laws of the Province of Ontario and the
        applicable federal laws of Canada. Courts in Ontario will have exclusive
        jurisdiction, subject to mandatory consumer protections that cannot be
        waived.
      </p>

      <h2>15. Contact</h2>
      <p>
        Questions about these Terms:{" "}
        <a href="mailto:notify@houzzat.com">notify@houzzat.com</a>
      </p>
      <p className="text-sm text-ink/50">
        This page is a practical starting template for website and app-store
        compliance. Have qualified counsel review it for your brokerage before
        relying on it in regulated contexts.
      </p>
    </LegalDocument>
  );
}
