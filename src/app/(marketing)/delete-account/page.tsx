import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocument } from "@/components/site/LegalDocument";
import { SITE_NAME, SITE_URL } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Delete your account",
  description: `How to request deletion of your ${SITE_NAME} account and associated data.`,
  alternates: { canonical: `${SITE_URL}/delete-account` },
};

export default function DeleteAccountPage() {
  return (
    <LegalDocument title="Delete your Houzzat account" updated="August 22, 2026">
      <p>
        This page explains how to request deletion or deactivation of your{" "}
        <strong>{SITE_NAME}</strong> account and associated personal data,
        including consumer accounts and HouzzatPro staff accounts.
      </p>

      <h2>How to request deletion</h2>
      <ol className="list-decimal space-y-2 pl-5">
        <li>
          Email{" "}
          <a href="mailto:notify@houzzat.com?subject=Delete%20my%20Houzzat%20account">
            notify@houzzat.com
          </a>{" "}
          from the email address on your Houzzat account.
        </li>
        <li>
          Use the subject line: <strong>Delete my Houzzat account</strong>.
        </li>
        <li>
          Include your full name and confirm you want the account permanently
          deleted or deactivated.
        </li>
      </ol>
      <p>
        We will verify the request and delete or anonymize your account data
        within a reasonable period, usually within <strong>30 days</strong>,
        subject to the retention notes below.
      </p>

      <h2>Consumer accounts</h2>
      <p>
        Use the instructions above to request deletion of a Houzzat buyer or
        seller account.
      </p>

      <h2>HouzzatPro / staff accounts</h2>
      <p>
        Agents and administrators may request deletion or deactivation of their
        Houzzat staff account by emailing{" "}
        <a href="mailto:notify@houzzat.com?subject=Delete%20my%20Houzzat%20account">
          notify@houzzat.com
        </a>{" "}
        from the email address associated with the account. Suggested subject:{" "}
        <strong>Delete my Houzzat account</strong>.
      </p>

      <h2>Organization-managed accounts</h2>
      <p>
        If HouzzatPro access was provisioned by a brokerage or administrator,
        the organization may also disable or remove the user’s CRM access.
      </p>
      <p>
        Houzzat will process deletion or deactivation requests in accordance
        with applicable legal, security, MLS/board, and record-retention
        requirements. Certain CRM or business records may need to be retained,
        reassigned, or de-identified where required or permitted.
      </p>

      <h2>What is deleted</h2>
      <ul>
        <li>Account profile (name, email, phone on file)</li>
        <li>Saved homes, watches, saved searches, and in-app preferences</li>
        <li>Notes and route-planner data tied to your account</li>
        <li>Login credentials for the deleted account</li>
      </ul>

      <h2>What may be kept for a limited time</h2>
      <ul>
        <li>
          Records we must retain for legal, security, fraud-prevention, or MLS® /
          board compliance (for example consent logs or lead records required by
          law)
        </li>
        <li>
          Backup copies, which are removed on a normal backup rotation schedule
        </li>
        <li>
          Aggregated or anonymized analytics that no longer identify you
        </li>
      </ul>

      <h2>After deletion</h2>
      <p>
        You will lose access to saved homes, alerts, and VOW client features tied
        to that account. Staff users also lose HouzzatPro CRM access tied to that
        login. You can create a new consumer account later if you want to use
        Houzzat again; staff access may require a new organization invitation or
        administrator action.
      </p>

      <p>
        Related: <Link href="/privacy">Privacy Policy</Link> ·{" "}
        <Link href="/terms">Terms of Use</Link> ·{" "}
        <Link href="/account">Account</Link>
      </p>
    </LegalDocument>
  );
}
