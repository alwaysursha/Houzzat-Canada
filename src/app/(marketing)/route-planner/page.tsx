import { RoutePlannerClient } from "@/components/route-planner/RoutePlannerClient";
import { resolveMarketingWhatsAppNumber } from "@/lib/tenancy/resolve-tenant-whatsapp";

/** Public Route Planner — guests use localStorage; signed-in users hit the API. */
export default async function PublicRoutePlannerPage() {
  const expertWhatsApp = await resolveMarketingWhatsAppNumber();
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <RoutePlannerClient expertWhatsApp={expertWhatsApp} />
    </div>
  );
}
