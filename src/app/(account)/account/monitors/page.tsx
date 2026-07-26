import { redirect } from "next/navigation";

/** @deprecated Prefer /account/watchlist */
export default function AccountMonitorsRedirectPage() {
  redirect("/account/watchlist");
}
