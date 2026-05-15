# Security Policy

## Reporting Vulnerabilities

Please report security vulnerabilities by opening a private issue or contacting the maintainers directly. Do not disclose vulnerabilities publicly until they have been addressed.

## Operator Access (Admin Grant)

Admin access is granted in two layered ways, OR-merged at every check site:

1. **`ADMIN_EMAILS` env var** — comma-separated, case-insensitive list of email addresses treated as admin regardless of the DB `User.isAdmin` column. Used to bootstrap operator access on fresh deployments without committing operator identities to source control or migrations.
2. **`User.isAdmin` column** — flipped via the admin panel for ad-hoc grants.

Both signals are merged in `src/lib/auth/admin.ts` (`isAdminEmail`) and consumed in both:
- the NextAuth jwt callback (`src/lib/auth/session.ts`) — drives the JWT `isAdmin` claim used by UI guards (e.g. the admin layout)
- the `requireAdmin()` server helper (`src/lib/auth/index.ts`) — gates every `adminRoute()`-protected API route

When changing admin-gating logic, both call sites must stay in sync. Updating only one produces the half-broken state where UI access works but server routes return 403 (or vice versa).

Do **not** hardcode operator emails in migrations, seed scripts, or source files — the repo is public.

## Dependency Vulnerability Policy

All dependencies are scanned on every CI run using `pnpm audit --audit-level=high`. New high or critical findings will fail the build.

## Audit Status

Last audit: 2026-03-29
Result: 0 critical, 0 high (after Next.js 15.5.14 upgrade and transitive dep overrides)

## Accepted Risks

No accepted risks at this time. All known high and critical vulnerabilities have been remediated.

### Previously Accepted / Resolved

The following CVEs were present in Next.js 14.x and have been fully resolved by upgrading to Next.js 15.5.14:

| CVE / Advisory | Severity | Package | Description | Resolution |
|---|---|---|---|---|
| GHSA-h25m-26qc-wcjf | High | next@14.2.35 | HTTP request deserialization DoS via insecure RSC | Upgraded to next@15.5.14 |
| GHSA-9g9p-9gw9-jx7f | Moderate | next@14.2.35 | DoS via Image Optimizer remotePatterns | Upgraded to next@15.5.14 |
| GHSA-c2c7-rcm5-vvqj | High | picomatch@4.0.3 | ReDoS via extglob quantifiers | Overridden to >=4.0.4 via pnpm.overrides |
| GHSA-3v7f-55p6-f55p | Moderate | picomatch@4.0.3 | Method Injection in POSIX Character Classes | Overridden to >=4.0.4 via pnpm.overrides |
| (brace-expansion) | Moderate | brace-expansion@5.0.4 | Zero-step sequence process hang | Overridden to >=5.0.5 via pnpm.overrides |

## CI Enforcement

The CI pipeline (`ci.yml`) runs `pnpm audit --audit-level=high` after every dependency install. Any new high or critical vulnerability will fail the build and block deployment.
