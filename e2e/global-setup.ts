import { registerUser, uniqueEmail, DEFAULT_PASSWORD } from "./helpers";
import fs from "fs";
import path from "path";

/**
 * Playwright globalSetup — registers ONE shared test user so that spec files
 * do not each hit /api/register individually.  This keeps staging E2E runs
 * well within the rate-limit window (5 reqs / 15 min).
 *
 * Credentials are written to e2e/.shared-user.json and read back by
 * getSharedUser() in helpers.ts.
 */
export default async function globalSetup() {
  const baseURL = process.env.BASE_URL ?? "http://localhost:3200";
  const email = uniqueEmail("shared");
  const password = DEFAULT_PASSWORD;
  const name = "Shared E2E User";

  await registerUser(baseURL, { name, email, password });

  const outPath = path.join(__dirname, ".shared-user.json");
  fs.writeFileSync(outPath, JSON.stringify({ email, password, name }));
}
