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
  /** If true, shows a compact dropdown instead of full labels */
  compact?: boolean;
}

export function LocaleSwitcher({ compact = false }: LocaleSwitcherProps) {
  const t = useTranslations("common");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();

  function switchLocale(nextLocale: Locale) {
    if (nextLocale === locale) return;

    // Swap the locale segment in the current URL.
    // pathname from next/navigation already strips the locale prefix for default locale,
    // so we need to handle both cases.
    const currentLocalePrefix = `/${locale}`;
    let newPath: string;

    if (pathname.startsWith(currentLocalePrefix + "/") || pathname === currentLocalePrefix) {
      // Replace existing locale prefix
      newPath = pathname.replace(currentLocalePrefix, `/${nextLocale}`);
    } else {
      // No locale prefix currently (default locale "en" with as-needed)
      newPath = `/${nextLocale}${pathname}`;
    }

    router.push(newPath);
  }

  if (compact) {
    return (
      <select
        value={locale}
        onChange={(e) => switchLocale(e.target.value as Locale)}
        aria-label={t("language")}
        className="bg-transparent text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1 cursor-pointer focus:outline-none focus:ring-2 focus:ring-violet-500"
      >
        {locales.map((l) => (
          <option key={l} value={l}>
            {LOCALE_FLAGS[l]} {LOCALE_LABELS[l]}
          </option>
        ))}
      </select>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide px-2">
        {t("language")}
      </p>
      {locales.map((l) => (
        <button
          key={l}
          onClick={() => switchLocale(l)}
          aria-pressed={l === locale}
          className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors text-left ${
            l === locale
              ? "bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 font-medium"
              : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
          }`}
        >
          <span aria-hidden="true">{LOCALE_FLAGS[l]}</span>
          {LOCALE_LABELS[l]}
        </button>
      ))}
    </div>
  );
}
