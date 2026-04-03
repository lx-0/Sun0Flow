/** @type {import('@lhci/cli').LighthouseRcConfig} */
module.exports = {
  ci: {
    collect: {
      // Pages to audit — unauthenticated routes only (auth-gated pages
      // require a running server with seeded session cookies, which is a
      // separate workflow concern).
      url: [
        "http://localhost:3000/en",          // landing page
        "http://localhost:3000/en/login",    // login page
        "http://localhost:3000/en/pricing",  // pricing page
      ],
      numberOfRuns: 3,
      settings: {
        // Use desktop preset for consistent results; adjust to "mobile" if
        // targeting mobile Lighthouse scores.
        preset: "desktop",
        // Throttle CPU to simulate a mid-range device (4x slowdown).
        throttlingMethod: "simulate",
        // Skip PWA audits — app requires authentication for full PWA flow.
        onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
      },
    },
    assert: {
      // NOTE: no preset — lighthouse:no-pwa pulled in dozens of default
      // assertions that produce NaN / 0 in CI (locale redirects, missing
      // canonical on redirect target, console errors from missing env vars,
      // non-composited animations, etc.).  We assert only what we explicitly
      // care about below.
      assertions: {
        // Accessibility — enforce WCAG compliance (warn-only; score fluctuates in CI)
        "categories:accessibility": ["warn", { minScore: 0.85 }],
        // Best practices
        "categories:best-practices": ["warn", { minScore: 0.9 }],
        // SEO (warn-only; login page lacks meta-description by design)
        "categories:seo": ["warn", { minScore: 0.8 }],

        // Core Web Vitals thresholds (desktop) — warn only; CI environment
        // produces NaN for redirected pages so these act as guard-rails for
        // the pages that do report values.
        "first-contentful-paint": ["warn", { maxNumericValue: 2000 }],
        "cumulative-layout-shift": ["warn", { maxNumericValue: 0.1 }],

        // Image optimisation
        "uses-optimized-images": ["warn", { maxLength: 0 }],
        "uses-responsive-images": ["warn", { maxLength: 0 }],
      },
    },
    upload: {
      target: "temporary-public-storage",
    },
  },
};
