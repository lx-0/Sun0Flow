/**
 * Env-based admin grant.
 *
 * `ADMIN_EMAILS` is a comma-separated, case-insensitive list of email
 * addresses that are treated as admins regardless of the DB `User.isAdmin`
 * flag. Used to bootstrap operator access without storing operator identities
 * in source control or migrations.
 *
 * The auth callback OR-merges this with `User.isAdmin`, so admins granted via
 * the admin panel (DB flag) continue to work too.
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const raw = process.env.ADMIN_EMAILS;
  if (!raw) return false;
  const target = email.trim().toLowerCase();
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(target);
}
