import { createPublicRoute } from "@/components/platform/public/site/create-public-route";

const route = createPublicRoute("/product-updates");

export const dynamic = "force-dynamic";
export const generateMetadata = route.generateMetadata;
export default route.Page;
