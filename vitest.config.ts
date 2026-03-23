import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    exclude: ["node_modules", "e2e"],
    coverage: {
      provider: "v8",
      all: true,
      include: [
        "src/lib/**",
        "src/app/api/generate/route.ts",
        "src/app/api/songs/route.ts",
        "src/app/api/songs/[id]/status/route.ts",
        "src/app/api/ratings/route.ts",
        "src/app/api/playlists/route.ts",
        "src/app/api/credits/route.ts",
        "src/app/api/health/route.ts",
        "src/app/api/register/route.ts",
      ],
      exclude: [
        "src/lib/prisma.ts",
        "src/lib/auth.ts",
        "src/lib/env.ts",
        "src/lib/email.ts",
        "src/lib/instagram.ts",
        "src/lib/openapi.ts",
        "src/lib/rss.ts",
        "src/lib/export.ts",
        "src/lib/download.ts",
        "**/*.d.ts",
        "**/*.test.ts",
      ],
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
});
