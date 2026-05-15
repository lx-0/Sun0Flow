import { openApiComponents } from "@/lib/openapi-components";
import { openApiPaths } from "@/lib/openapi-paths";

export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "SunoFlow API",
    version: "0.1.0",
    description:
      "SunoFlow — AI music generation manager. Manage songs, playlists, tags, templates, and more.",
  },
  servers: [{ url: "/", description: "Current server" }],
  components: openApiComponents,
  security: [{ session: [] }],
  paths: openApiPaths,
} as const;
