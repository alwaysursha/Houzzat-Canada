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
    <LegalDocument title="Delete your Houzzat account" updated="August 9, 2026">
      <p>
        This page explains how to request deletion of your{" "}
        <strong>{SITE_NAME}</strong> account and associated personal data.
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
          deleted.
        </li>
      </ol>
      <p>
        We will verify the request and delete or anonymize your account data
        within a reasonable period, usually within <strong>30 days</strong>.
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
        to that account. You can create a new account later if you want to use
        Houzzat again.
      </p>

      <p>
        Related: <Link href="/privacy">Privacy Policy</Link> ·{" "}
        <Link href="/terms">Terms of Use</Link> ·{" "}
        <Link href="/account">Account</Link>
      </p>
    </LegalDocument>
  );
}
