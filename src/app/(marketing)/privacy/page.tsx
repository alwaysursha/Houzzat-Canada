import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocument } from "@/components/site/LegalDocument";
import { buildMarketingPageMetadata } from "@/lib/tenancy/marketing-page-metadata";
import { resolveMarketingLegalSiteContext } from "@/lib/tenancy/marketing-legal-context";

export async function generateMetadata(): Promise<Metadata> {
  return buildMarketingPageMetadata({
    title: "Privacy Policy",
    description: `How we collect, use, and protect your personal information.`,
    path: "/privacy",
  });
}

export default async function PrivacyPage() {
  const { siteName, siteHost, supportEmail, isHouzzatWorkspace } =
    await resolveMarketingLegalSiteContext();

  return (
    <LegalDocument title="Privacy Policy" updated="August 22, 2026">
      <p>
        This Privacy Policy explains how <strong>{siteName}</strong> (“we”,
        “us”, “our”) collects, uses, discloses, and protects personal
        information when you use {siteHost}, our mobile applications
        (including HouzzatPro), and related services (the “Services”).
      </p>
      <p>
        We operate in Canada and handle personal information in accordance with
        applicable Canadian privacy law, including the Personal Information
        Protection and Electronic Documents Act (PIPEDA) and, where applicable,
        provincial privacy legislation.
      </p>

      <h2>1. Who we are</h2>
      <p>
        {siteName} is a real estate search and client-engagement platform
        {isHouzzatWorkspace
          ? " associated with licensed brokerage activity through Royal LePage Credit Valley Real Estate."
          : " operated in connection with licensed real estate professionals."}{" "}
        For privacy questions, contact:
      </p>
      <ul>
        <li>
          Email:{" "}
          <a href={`mailto:${supportEmail}`}>{supportEmail}</a>
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
          Register you as a {siteName} client where required for VOW access to
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

      <h2>7. HouzzatPro / staff app</h2>
      <p>
        HouzzatPro is a separate mobile app for authorized real-estate agents
        and brokerage administrators. Staff accounts may be
        organization-provisioned, for example through an invitation or brokerage
        administrator.
      </p>
      <p>
        <strong>Customer CRM information.</strong> Authorized staff may access
        customer information needed to provide real-estate services, including
        names, email addresses, phone numbers, inquiries, lead notes, tasks,
        appointments, and related activity, subject to applicable role and
        brokerage access controls.
      </p>
      <p>
        <strong>Service providers.</strong> We use service providers and
        processors, including hosting/database infrastructure, Firebase Cloud
        Messaging for push delivery, and email-delivery providers, to operate
        the Services.
      </p>
      <p>
        <strong>Push notifications.</strong> With permission, HouzzatPro may
        store a device push token associated with the signed-in staff account to
        deliver work-related alerts. Push tokens are not sold.
      </p>
      <p>
        <strong>Biometric unlock.</strong> Optional biometric unlock uses the
        device’s biometric system. Houzzat does not receive fingerprint or
        facial biometric images. Biometric preference information is stored
        locally on the device. Authentication continues to rely on the user’s
        Houzzat account session.
      </p>
      <p>
        <strong>Remembered sign-in.</strong> If a user chooses to remain signed
        in or use remembered sign-in functionality, limited sign-in information
        may be stored locally on that device.
      </p>
      <p>
        <strong>Location.</strong> If a user invokes a location-based feature
        such as “Near me” within Agent Search, HouzzatPro may access approximate
        device location with permission. HouzzatPro does not use background
        location tracking.
      </p>
      <p>
        <strong>Advertising.</strong> HouzzatPro does not display advertising
        and does not use an advertising identifier for advertising purposes.
      </p>
      <p>
        <strong>Staff account deletion.</strong> Staff may request deletion or
        deactivation of their Houzzat account by contacting{" "}
        <a href={`mailto:${supportEmail}`}>{supportEmail}</a>.
        Organization-managed access may also be disabled by an authorized
        brokerage administrator. We process deletion or deactivation requests
        subject to applicable legal, security, MLS/board, and record-retention
        requirements. See also{" "}
        <Link href="/delete-account">Delete your account</Link>.
      </p>

      <h2>8. Retention</h2>
      <p>
        We keep personal information only as long as needed for the purposes
        above, including legal, accounting, board-compliance, and dispute
        resolution requirements. When no longer needed, we delete or anonymize
        it where practical.
      </p>

      <h2>9. Security</h2>
      <p>
        We use administrative, technical, and physical safeguards appropriate to
        the sensitivity of the information, including encrypted transport (HTTPS)
        and hashed passwords. No method of transmission or storage is completely
        secure.
      </p>

      <h2>10. Your choices and rights</h2>
      <p>
        Subject to applicable law, you may request access to, correction of, or
        deletion of your personal information, and you may withdraw consent where
        consent is the basis for processing (without affecting prior lawful
        processing). Contact{" "}
        <a href={`mailto:${supportEmail}`}>{supportEmail}</a>. We may need
        to verify your identity before fulfilling a request.
      </p>

      <h2>11. Children’s privacy</h2>
      <p>
        The Services are intended for adults seeking real estate information in
        Canada. We do not knowingly collect personal information from children
        under 13.
      </p>

      <h2>12. International processing</h2>
      <p>
        Our vendors may process data in Canada or other countries. Where data is
        processed outside Canada, it may be subject to the laws of those
        jurisdictions.
      </p>

      <h2>13. Changes</h2>
      <p>
        We may update this Privacy Policy from time to time. The “Last updated”
        date will change when we do. Continued use of the Services after an
        update means you accept the revised policy.
      </p>

      <h2>14. Related terms</h2>
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
