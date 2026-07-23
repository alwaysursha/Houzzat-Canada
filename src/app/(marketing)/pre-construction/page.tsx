import { redirect } from "next/navigation";

export const metadata = { title: "Pre-construction" };

/** Public pre-construction hub is hidden for now — reopen when Booking/Assignment ships. */
export default function PreConstructionPage() {
  redirect("/search");
}
