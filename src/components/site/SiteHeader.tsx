import Link from "next/link";
import { AuthOpenButton } from "@/components/auth/AuthOpenButton";
import { HeaderBuySearch } from "@/components/site/HeaderBuySearch";
import { LanguageToggle } from "@/components/site/LanguageToggle";
import { SITE_NAME } from "@/lib/constants";
import { auth } from "@/lib/auth";
import { t } from "@/lib/i18n/dictionaries";
import { getLocale } from "@/lib/i18n/locale";

export async function SiteHeader() {
  const [session, locale] = await Promise.all([auth(), getLocale()]);
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
    <header className="sticky top-0 z-40 border-b border-line/80 bg-mist/85 backdrop-blur-md">
      <div className="flex h-16 w-full items-center gap-2 px-4 sm:px-6 lg:px-10">
        <Link
          href="/"
          className="shrink-0 font-display text-2xl tracking-tight text-ink"
        >
          {SITE_NAME}
        </Link>
        <HeaderBuySearch />
        <div className="ml-auto flex shrink-0 items-center gap-3">
          <LanguageToggle locale={locale} />
          {portalHref ? (
            <Link
              href={portalHref}
              className="rounded-lg bg-canopy px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-canopy-deep"
            >
              {portalLabel}
            </Link>
          ) : (
            <AuthOpenButton
              mode="sign-in"
              className="rounded-lg bg-canopy px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-canopy-deep"
            >
              {portalLabel}
            </AuthOpenButton>
          )}
        </div>
      </div>
    </header>
  );
}
