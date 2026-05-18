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

/**
 * Pre-warm protected routes so that the first unauthenticated request in tests
 * doesn't hit the server during a transient startup window. Without this, CI
 * sometimes sees ERR_CONNECTION_REFUSED for the first unauthenticated request
 * to /generate and /mashup after the server has been processing other requests.
 */
async function warmupServer(baseURL: string) {
  const routes = ["/generate", "/mashup", "/"];
  for (const route of routes) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await fetch(`${baseURL}${route}`, { redirect: "manual", signal: AbortSignal.timeout(5000) });
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }
}

export default async function globalSetup() {
  const baseURL = process.env.BASE_URL ?? "http://localhost:3200";
  const outPath = path.join(__dirname, ".shared-user.json");

  // Reuse credentials from a prior run to avoid hitting the registration rate limit.
  if (fs.existsSync(outPath)) {
    await warmupServer(baseURL);
    return;
  }

  const email = uniqueEmail("shared");
  const password = DEFAULT_PASSWORD;
  const name = "Shared E2E User";

  await registerUser(baseURL, { name, email, password });
  fs.writeFileSync(outPath, JSON.stringify({ email, password, name }));
  await warmupServer(baseURL);
}
