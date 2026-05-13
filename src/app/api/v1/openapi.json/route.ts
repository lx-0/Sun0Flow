import { NextResponse } from "next/server";
import { publicRoute } from "@/lib/route-handler";
import { openApiSpec } from "@/lib/openapi";

/**
 * Serve the OpenAPI 3.0 specification for /api/v1/.
 *
 * Paths in the source spec use an /api/ prefix; this handler strips that
 * prefix so paths are relative to the /api/v1 server base URL, which is
 * what OpenAPI clients expect.
 */
function buildV1Spec() {
  const v1Paths: Record<string, unknown> = {};
  for (const [path, definition] of Object.entries(
    (openApiSpec as { paths?: Record<string, unknown> }).paths ?? {}
  )) {
    // Strip leading /api so paths are relative to the /api/v1 server URL.
    const v1Path = path.replace(/^\/api\//, "/");
    v1Paths[v1Path] = definition;
  }

  return {
    ...openApiSpec,
    info: {
      ...openApiSpec.info,
      version: "1.0.0",
    },
    servers: [{ url: "/api/v1", description: "SunoFlow API v1" }],
    paths: v1Paths,
  };
}

export const GET = publicRoute(async () => {
  return NextResponse.json(buildV1Spec(), {
    headers: {
      "X-API-Version": "1",
      // Allow Swagger UI on the same origin to fetch the spec.
      "Access-Control-Allow-Origin": "*",
    },
  });
}, { route: "/api/v1/openapi.json" });
