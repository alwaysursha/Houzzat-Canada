import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocument } from "@/components/site/LegalDocument";
import { SITE_NAME, SITE_URL } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `How ${SITE_NAME} collects, uses, and protects your personal information.`,
  alternates: { canonical: `${SITE_URL}/privacy` },
};

export default function PrivacyPage() {
  return (
    <LegalDocument title="Privacy Policy" updated="August 8, 2026">
      <p>
        This Privacy Policy explains how <strong>{SITE_NAME}</strong> (“we”,
        “us”, “our”) collects, uses, discloses, and protects personal
        information when you use houzzat.com, our mobile applications, and
        related services (the “Services”).
      </p>
      <p>
        We operate in Canada and handle personal information in accordance with
        applicable Canadian privacy law, including the Personal Information
        Protection and Electronic Documents Act (PIPEDA) and, where applicable,
        provincial privacy legislation.
      </p>

      <h2>1. Who we are</h2>
      <p>
        {SITE_NAME} is a real estate search and client-engagement platform
        associated with licensed brokerage activity through Royal LePage Credit
        Valley Real Estate. For privacy questions, contact:
      </p>
      <ul>
        <li>
          Email:{" "}
          <a href="mailto:notify@houzzat.com">notify@houzzat.com</a>
        </li>
        <li>Phone: 647-221-4949</li>
        <li>Mail: 1-10045 Hurontario St., Brampton, ON L6Z 0E6</li>
      </ul>

      <h2>2. Information we collect</h2>
      <p>We may collect:</p>
      <ul>
        <li>
          <strong>Account information</strong> — name, email, phone number,
          password (stored hashed), and account preferences.
        </li>
        <li>
          <strong>Search and activity data</strong> — saved homes, watched
          listings/areas, saved searches, route planner data, valuation
          requests, and in-app browsing activity related to your home search.
        </li>
        <li>
          <strong>Communications</strong> — messages you send to agents or
          through contact/viewing forms, and records of email/SMS alerts you
          receive.
        </li>
        <li>
          <strong>Device and usage data</strong> — IP address, browser/app type,
          approximate location (if you allow it), cookies/local storage, and
          diagnostic logs needed to operate and secure the Services.
        </li>
        <li>
          <strong>Mobile app data</strong> — push notification tokens, and
          (with your permission) biometric unlock status stored on-device. We do
          not receive your fingerprint or Face ID image data.
        </li>
        <li>
          <strong>MLS® / listing data</strong> — property listing content
          provided via TRREB / PropTx (IDX/VOW). Listing data is subject to
          board and data-provider rules.
        </li>
      </ul>

      <h2>3. How we use information</h2>
      <p>We use personal information to:</p>
      <ul>
        <li>Provide and improve search, alerts, saved homes, and account features</li>
        <li>
          Register you as a {SITE_NAME} client where required for VOW access to
          sold/leased prices and listing history
        </li>
        <li>
          Send transactional and alert communications you request or that relate
          to your account (for example price changes, new matches, digests)
        </li>
        <li>Connect you with a real estate professional when you ask to be contacted</li>
        <li>Prevent fraud, secure accounts, and comply with legal and board requirements</li>
        <li>Understand product usage so we can improve performance and relevance</li>
      </ul>

      <h2>4. Cookies and similar technologies</h2>
      <p>
        We use cookies, local storage, and similar technologies for sign-in
        sessions, preferences, analytics, and (where used) advertising
        measurement. You can control cookies through your browser settings; some
        features may not work if cookies are disabled.
      </p>

      <h2>5. Sharing of information</h2>
      <p>We may share information with:</p>
      <ul>
        <li>
          <strong>Licensed agents / brokerage</strong> — when you request
          contact, book a viewing, or otherwise ask for professional help
        </li>
        <li>
          <strong>Service providers</strong> — hosting, email delivery,
          analytics, mapping, and authentication vendors who process data on our
          instructions
        </li>
        <li>
          <strong>MLS® / data providers</strong> — as required to display listing
          data and meet VOW/IDX compliance obligations
        </li>
        <li>
          <strong>Legal authorities</strong> — when required by law, board rules,
          or to protect rights, safety, and security
        </li>
      </ul>
      <p>We do not sell your personal information.</p>

      <h2>6. Email, SMS, and push notifications</h2>
      <p>
        If you create an account or enable alerts, we may send email, phone/SMS,
        and (in the mobile app) push notifications related to your home search
        and account. You can unsubscribe from marketing-style emails where
        offered, disable push in device settings, and manage watches/saved
        searches in your account. Transactional messages (security, account, or
        legally required notices) may still be sent.
      </p>

      <h2>7. Retention</h2>
      <p>
        We keep personal information only as long as needed for the purposes
        above, including legal, accounting, board-compliance, and dispute
        resolution requirements. When no longer needed, we delete or anonymize
        it where practical.
      </p>

      <h2>8. Security</h2>
      <p>
        We use administrative, technical, and physical safeguards appropriate to
        the sensitivity of the information, including encrypted transport (HTTPS)
        and hashed passwords. No method of transmission or storage is completely
        secure.
      </p>

      <h2>9. Your choices and rights</h2>
      <p>
        Subject to applicable law, you may request access to, correction of, or
        deletion of your personal information, and you may withdraw consent where
        consent is the basis for processing (without affecting prior lawful
        processing).         Contact{" "}
        <a href="mailto:notify@houzzat.com">notify@houzzat.com</a>. We may need
        to verify your identity before fulfilling a request.
      </p>

      <h2>10. Children’s privacy</h2>
      <p>
        The Services are intended for adults seeking real estate information in
        Canada. We do not knowingly collect personal information from children
        under 13.
      </p>

      <h2>11. International processing</h2>
      <p>
        Our vendors may process data in Canada or other countries. Where data is
        processed outside Canada, it may be subject to the laws of those
        jurisdictions.
      </p>

      <h2>12. Changes</h2>
      <p>
        We may update this Privacy Policy from time to time. The “Last updated”
        date will change when we do. Continued use of the Services after an
        update means you accept the revised policy.
      </p>

      <h2>13. Related terms</h2>
      <p>
        Use of the Services is also governed by our{" "}
        <Link href="/terms">Terms of Use</Link>.
      </p>
      <p className="text-sm text-ink/50">
        This page is provided for transparency and app-store compliance. It is
        not legal advice. Have counsel review it for your brokerage before
        relying on it in regulated contexts.
      </p>
    </LegalDocument>
  );
}
