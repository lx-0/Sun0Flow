#!/usr/bin/env tsx
/**
 * SunoFlow MCP Server — stdio transport.
 *
 * Usage:
 *   SUNOFLOW_API_KEY=sk-... tsx mcp/server.ts
 *
 * Or via Claude Desktop config (see docs/MCP.md).
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ReadResourceRequestSchema,
  McpError,
  ErrorCode,
} from "@modelcontextprotocol/sdk/types.js";

import { resolveApiKeyFromEnv } from "./auth";
import { getTools, getTool } from "./registry";
import {
  getStaticResources,
  getTemplateResources,
  resolveResource,
} from "./resources";

// Register all tools by importing them (side-effect: calls registerTool)
import "./tools/info";
import "./tools/generate_song";
import "./tools/list_songs";
import "./tools/get_song";
import "./tools/playlist";
import "./tools/get_credits";

// Register all resource providers by importing them (side-effect: calls register*)
import "./providers/songs";
import "./providers/playlists";
import "./providers/feed";
import "./providers/credits";

async function main(): Promise<void> {
  const userId = await resolveApiKeyFromEnv();
  if (!userId) {
    process.stderr.write(
      "Error: SUNOFLOW_API_KEY is missing, invalid, or revoked.\n" +
        "Set SUNOFLOW_API_KEY=sk-... before starting the server.\n"
    );
    process.exit(1);
  }

  const server = new Server(
    { name: "sunoflow-mcp", version: "0.1.0" },
    { capabilities: { tools: {}, resources: {} } }
  );

  // ── Tools ──────────────────────────────────────────────────────────────────

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: getTools().map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = getTool(request.params.name);
    if (!tool) {
      throw new McpError(
        ErrorCode.MethodNotFound,
        `Unknown tool: ${request.params.name}`
      );
    }

    const result = await tool.handler(request.params.arguments ?? {}, userId);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  });

  // ── Resources ──────────────────────────────────────────────────────────────

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: getStaticResources().map((r) => ({
      uri: r.uri,
      name: r.name,
      description: r.description,
      mimeType: r.mimeType,
    })),
  }));

  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
    resourceTemplates: getTemplateResources().map((t) => ({
      uriTemplate: t.uriTemplate,
      name: t.name,
      description: t.description,
      mimeType: t.mimeType,
    })),
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = request.params.uri;
    const content = await resolveResource(uri, userId);

    if (!content) {
      throw new McpError(ErrorCode.InvalidRequest, `Unknown resource: ${uri}`);
    }

    return {
      contents: [
        {
          uri: content.uri,
          mimeType: content.mimeType,
          text: content.text,
        },
      ],
    };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.stderr.write("SunoFlow MCP server running (stdio)\n");
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`Fatal: ${message}\n`);
  process.exit(1);
});
