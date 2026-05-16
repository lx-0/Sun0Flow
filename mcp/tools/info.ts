/**
 * Built-in info tool — returns server version and list of available tools.
 */

import { registerTool, getTools } from "../registry";

registerTool({
  name: "sunoflow_info",
  description:
    "Returns SunoFlow MCP server version and a list of all available tools with their descriptions.",
  inputSchema: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
  async handler() {
    const tools = getTools();
    return {
      server: "sunoflow-mcp",
      version: "0.2.1",
      tools: tools.map((t) => ({ name: t.name, description: t.description })),
    };
  },
});
