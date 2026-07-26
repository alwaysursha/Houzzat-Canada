import { ViewingDayClient } from "@/components/viewing-day/ViewingDayClient";

/** Public Viewing day planner — guests use localStorage; signed-in users hit the API. */
export default function PublicViewingDayPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <ViewingDayClient />
    </div>
  );
}
