import { afterEach, beforeEach, expect, test } from "bun:test";
/**
 * E2E test for the MCP server using an in-memory transport pair. Verifies each tool
 * returns the expected shape and the underlying editkit primitives are wired correctly.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.ts";

let client: Client;
let serverClose: () => Promise<void>;

beforeEach(async () => {
  const server = createServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  client = new Client({ name: "editkit-mcp-test", version: "0.0.0" });
  await client.connect(clientTransport);
  serverClose = () => server.close();
});

afterEach(async () => {
  await client.close();
  await serverClose();
});

const SEARCH_REPLACE_BLOCK = "src/x.ts\n<<<<<<< SEARCH\nfoo\n=======\nbar\n>>>>>>> REPLACE\n";

function textOf(result: unknown): string {
  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content) || content.length === 0) {
    throw new Error("no content in result");
  }
  const first = content[0] as { type?: string; text?: string };
  if (first?.type === "text" && typeof first.text === "string") return first.text;
  throw new Error("no text content in result");
}

test("exposes four tools", async () => {
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  expect(names).toEqual(["apply_edits", "detect_formats", "fuzzy_replace", "parse_edits"]);
});

test("detect_formats returns search-replace", async () => {
  const result = await client.callTool({
    name: "detect_formats",
    arguments: { input: SEARCH_REPLACE_BLOCK },
  });
  expect(JSON.parse(textOf(result))).toEqual(["search-replace"]);
});

test("parse_edits returns one edit", async () => {
  const result = await client.callTool({
    name: "parse_edits",
    arguments: { input: SEARCH_REPLACE_BLOCK },
  });
  const edits = JSON.parse(textOf(result));
  expect(edits).toHaveLength(1);
  expect(edits[0].format).toBe("search-replace");
  expect(edits[0].path).toBe("src/x.ts");
});

test("apply_edits applies a SEARCH/REPLACE block", async () => {
  const result = await client.callTool({
    name: "apply_edits",
    arguments: {
      input: SEARCH_REPLACE_BLOCK,
      files: { "src/x.ts": "before\nfoo\nafter\n" },
    },
  });
  const applied = JSON.parse(textOf(result));
  expect(applied).toHaveLength(1);
  expect(applied[0].ok).toBe(true);
  expect(applied[0].after).toBe("before\nbar\nafter\n");
});

test("apply_edits reports search-not-found", async () => {
  const result = await client.callTool({
    name: "apply_edits",
    arguments: {
      input: SEARCH_REPLACE_BLOCK,
      files: { "src/x.ts": "completely different contents\n" },
    },
  });
  const applied = JSON.parse(textOf(result));
  expect(applied[0].ok).toBe(false);
  expect(applied[0].reason).toBe("search-not-found");
});

test("fuzzy_replace handles indent-shifted matches", async () => {
  const result = await client.callTool({
    name: "fuzzy_replace",
    arguments: {
      original: "  foo()\n",
      search: "foo()",
      replace: "bar()",
    },
  });
  const out = JSON.parse(textOf(result));
  expect(out.kind).toBe("ok");
  expect(out.text).toBe("  bar()\n");
});
