"use client";

import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/i18n/dictionaries";

export function LanguageToggle({ locale }: { locale: Locale }) {
  const router = useRouter();

  function setLocale(next: Locale) {
    document.cookie = `houzzat_locale=${next};path=/;max-age=31536000;samesite=lax`;
    router.refresh();
  }

  return (
    <div className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide">
      <button
        type="button"
        onClick={() => setLocale("en")}
        className={locale === "en" ? "text-canopy" : "text-ink/40 hover:text-ink"}
        aria-pressed={locale === "en"}
      >
        EN
      </button>
      <span className="text-ink/25">/</span>
      <button
        type="button"
        onClick={() => setLocale("fr")}
        className={locale === "fr" ? "text-canopy" : "text-ink/40 hover:text-ink"}
        aria-pressed={locale === "fr"}
      >
        FR
      </button>
    </div>
  );
}
