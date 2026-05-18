/**
 * Safely serialize data for use in a <script type="application/ld+json"> tag.
 * JSON.stringify alone does not escape </script>, which allows an attacker to
 * break out of the script tag via crafted content.
 */
export function safeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}
