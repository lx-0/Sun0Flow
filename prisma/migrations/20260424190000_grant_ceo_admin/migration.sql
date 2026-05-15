-- Deprecated: admin grants are now driven by the ADMIN_EMAILS env var
-- (see src/lib/auth/admin.ts). This migration is retained so the migration
-- history hash chain stays intact on already-deployed databases; it performs
-- no schema or data change.
SELECT 1;
