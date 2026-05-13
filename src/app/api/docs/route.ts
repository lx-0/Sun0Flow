import { NextResponse } from "next/server";
import { publicRoute } from "@/lib/route-handler";
import { notFound } from "@/lib/api-error";

/**
 * GET /api/docs
 *
 * In development: returns an HTML page that renders the Swagger UI for
 * the SunoFlow v1 API spec.  The spec is fetched from /api/v1/openapi.json.
 *
 * In production: returns 404 — the interactive docs are a development-only
 * aid and should not be publicly exposed.
 */
export const GET = publicRoute(async () => {
  if (process.env.NODE_ENV !== "development") {
    return notFound();
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>SunoFlow API v1 — Swagger UI</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  <style>body { margin: 0; }</style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      url: "/api/v1/openapi.json",
      dom_id: "#swagger-ui",
      presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
      layout: "StandaloneLayout",
      deepLinking: true,
    });
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}, { route: "/api/docs" });
