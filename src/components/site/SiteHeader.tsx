import { SiteHeaderClient } from "@/components/site/SiteHeaderClient";
import { SITE_NAME } from "@/lib/constants";
import { auth } from "@/lib/auth";
import { t, type Locale } from "@/lib/i18n/dictionaries";
import { getLocale } from "@/lib/i18n/locale";

export async function SiteHeader() {
  let session = null;
  let locale: Locale = "en";

  try {
    session = await auth();
  } catch (error) {
    console.error("[SiteHeader] auth failed", error);
  }

  try {
    locale = await getLocale();
  } catch (error) {
    console.error("[SiteHeader] locale failed", error);
  }

  const role = session?.user?.role;

  let portalHref: string | null = null;
  let portalLabel = t(locale, "sign_in");

  if (session?.user) {
    if (role === "ADMIN") {
      portalHref = "/admin";
      portalLabel = t(locale, "admin");
    } else if (role === "AGENT") {
      portalHref = "/agent";
      portalLabel = t(locale, "agent_desk");
    } else {
      portalHref = "/account";
      portalLabel = t(locale, "my_account");
    }
  }

  return (
    <SiteHeaderClient
      siteName={SITE_NAME}
      locale={locale}
      portalHref={portalHref}
      portalLabel={portalLabel}
    />
  );
}
