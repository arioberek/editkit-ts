#!/usr/bin/env bun
/**
 * editkit MCP server — stdio transport.
 *
 * Run directly with `bun run src/index.ts` or via the `editkit-mcp` bin alias once the
 * package is installed. Designed to be spawned by MCP clients like Claude Desktop.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.ts";

async function main() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Log to stderr only — stdout is reserved for JSON-RPC messages.
  console.error("[editkit-mcp] connected on stdio");
}

main().catch((err) => {
  console.error("[editkit-mcp] fatal:", err);
  process.exit(1);
});
