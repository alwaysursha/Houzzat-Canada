import { permanentRedirect } from "next/navigation";

/** Hub lives at `/areas`; keep this path for sitemap/nav consistency. */
export default function HomesForSaleIndexPage() {
  permanentRedirect("/areas");
}
