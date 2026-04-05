"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter, usePathname } from "next/navigation";
import { locales, type Locale } from "@/i18n/routing";

const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  de: "Deutsch",
  ja: "日本語",
};

const LOCALE_FLAGS: Record<Locale, string> = {
  en: "🇬🇧",
  de: "🇩🇪",
  ja: "🇯🇵",
};

interface LocaleSwitcherProps {
  /** When true, shows only the flag (for collapsed sidebar) */
  iconOnly?: boolean;
  /** Kept for backwards compat — now always renders as dropdown */
  compact?: boolean;
}

export function LocaleSwitcher({ iconOnly = false }: LocaleSwitcherProps) {
  const t = useTranslations("common");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();

  function switchLocale(nextLocale: Locale) {
    if (nextLocale === locale) return;

    const currentLocalePrefix = `/${locale}`;
    let newPath: string;

    if (pathname.startsWith(currentLocalePrefix + "/") || pathname === currentLocalePrefix) {
      newPath = pathname.replace(currentLocalePrefix, `/${nextLocale}`);
    } else {
      newPath = `/${nextLocale}${pathname}`;
    }

    router.push(newPath);
  }

  if (iconOnly) {
    return (
      <select
        value={locale}
        onChange={(e) => switchLocale(e.target.value as Locale)}
        aria-label={t("language")}
        title={LOCALE_LABELS[locale]}
        className="w-10 h-10 bg-transparent text-lg text-center cursor-pointer appearance-none focus:outline-none focus:ring-2 focus:ring-violet-500 rounded-lg"
      >
        {locales.map((l) => (
          <option key={l} value={l}>
            {LOCALE_FLAGS[l]}
          </option>
        ))}
      </select>
    );
  }

  return (
    <select
      value={locale}
      onChange={(e) => switchLocale(e.target.value as Locale)}
      aria-label={t("language")}
      className="w-full bg-transparent text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1.5 cursor-pointer focus:outline-none focus:ring-2 focus:ring-violet-500"
    >
      {locales.map((l) => (
        <option key={l} value={l}>
          {LOCALE_FLAGS[l]} {LOCALE_LABELS[l]}
        </option>
      ))}
    </select>
  );
}
