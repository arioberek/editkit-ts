/**
 * Demo: spin up the MCP server with an in-memory transport pair and walk through each
 * tool call. Useful as a smoke test and as documentation. Run with:
 *
 *   bun run --filter editkit-example-mcp-server demo
 *
 * For a live stdio session against the MCP Inspector, see the README.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "./server.ts";

async function main() {
  const server = createServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  const client = new Client({ name: "editkit-mcp-demo", version: "0.0.0" });
  await client.connect(clientTransport);

  console.log("[demo] connected to editkit MCP server");

  const tools = await client.listTools();
  console.log(`[demo] tools: ${tools.tools.map((t) => t.name).join(", ")}`);

  // 1. detect_formats
  const detectResult = await client.callTool({
    name: "detect_formats",
    arguments: {
      input: "src/x.ts\n<<<<<<< SEARCH\nfoo\n=======\nbar\n>>>>>>> REPLACE\n",
    },
  });
  console.log(`[demo] detect_formats → ${textOf(detectResult)}`);

  // 2. parse_edits
  const parseResult = await client.callTool({
    name: "parse_edits",
    arguments: {
      input: "src/x.ts\n<<<<<<< SEARCH\nfoo\n=======\nbar\n>>>>>>> REPLACE\n",
    },
  });
  console.log(`[demo] parse_edits → ${textOf(parseResult).slice(0, 120)}...`);

  // 3. apply_edits
  const applyResult = await client.callTool({
    name: "apply_edits",
    arguments: {
      input: "src/x.ts\n<<<<<<< SEARCH\nfoo\n=======\nbar\n>>>>>>> REPLACE\n",
      files: { "src/x.ts": "before\nfoo\nafter\n" },
    },
  });
  const applied = JSON.parse(textOf(applyResult)) as Array<{
    ok: boolean;
    after?: string;
  }>;
  console.log(
    `[demo] apply_edits → ${applied.length} result(s), ok=${applied.filter((r) => r.ok).length}`,
  );
  if (applied[0]?.ok && applied[0].after) {
    console.log(
      `[demo]   resulting file:\n${applied[0].after
        .split("\n")
        .map((l) => `    ${l}`)
        .join("\n")}`,
    );
  }

  // 4. fuzzy_replace
  const fuzzyResult = await client.callTool({
    name: "fuzzy_replace",
    arguments: {
      original: "before\n  foo\nafter\n",
      search: "foo",
      replace: "bar",
    },
  });
  console.log(`[demo] fuzzy_replace → ${textOf(fuzzyResult)}`);

  await client.close();
  await server.close();
  console.log("\n\x1b[32m✓ all tools responded\x1b[0m");
}

function textOf(result: unknown): string {
  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content) || content.length === 0) return "(no text content)";
  const first = content[0] as { type?: string; text?: string };
  if (first?.type === "text" && typeof first.text === "string") return first.text;
  return "(no text content)";
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
