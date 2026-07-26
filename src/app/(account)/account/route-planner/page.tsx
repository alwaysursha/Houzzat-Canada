import { redirect } from "next/navigation";

/** Keep old account URL working. */
export default function AccountRoutePlannerRedirect() {
  redirect("/route-planner");
}
