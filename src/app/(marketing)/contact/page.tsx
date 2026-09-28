import { createPublicRoute } from "@/components/platform/public/site/create-public-route";

const route = createPublicRoute("/contact");

export const dynamic = "force-dynamic";
export const generateMetadata = route.generateMetadata;
export default route.Page;
