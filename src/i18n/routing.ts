import { defineRouting } from "next-intl/routing";

export const locales = ["en", "de", "ja"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale = "en" satisfies Locale;

export const routing = defineRouting({
  locales,
  defaultLocale,
  // English (default) omits the locale prefix from URLs
  localePrefix: "as-needed",
});
