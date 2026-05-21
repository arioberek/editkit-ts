/**
 * editkit MCP server.
 *
 * Exposes editkit's parsers and appliers as MCP tools that an LLM client (Claude Desktop,
 * Cursor, Continue, MCP Inspector, etc.) can call. All tools are pure: they do not touch
 * the filesystem. The caller provides current file contents and decides what to do with
 * the result.
 *
 * Tools:
 *   - parse_edits      → ParsedEdit[] for an LLM response string
 *   - apply_edits      → ApplyResult[] given an LLM response + a file map
 *   - detect_formats   → which formats appear in the response, in priority order
 *   - fuzzy_replace    → primitive: locate a SEARCH chunk and swap it for a REPLACE
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { applyEditsSync, detectFormats, fuzzyReplace, parseEdits } from "editkit";
import { z } from "zod";

const formatEnum = z.enum(["search-replace", "unified-diff", "whole-file"]);

const parseEditsInput = {
  input: z.string().describe("The raw LLM output (or any string containing edits)."),
  formats: z
    .array(formatEnum)
    .optional()
    .describe(
      "Restrict parsing to specific formats. Useful when you've prompted the model in one format and want hard-fails on the others.",
    ),
};

const applyEditsInput = {
  input: z.string().describe("The raw LLM output containing edits."),
  files: z
    .record(z.string(), z.string())
    .describe(
      "Map of file path → current contents. Edits to paths not in this map are treated as creates when `allowCreate` is true.",
    ),
  formats: z.array(formatEnum).optional(),
  fuzzyWhitespace: z
    .boolean()
    .optional()
    .describe("Tolerate indentation differences when matching SEARCH blocks. Default: true."),
  allowCreate: z
    .boolean()
    .optional()
    .describe("Treat unknown paths as new-file creates. Default: true."),
};

const detectFormatsInput = {
  input: z.string().describe("The LLM response or any string."),
};

const fuzzyReplaceInput = {
  original: z.string().describe("Current file contents."),
  search: z.string().describe("The chunk to find."),
  replace: z.string().describe("What to replace it with."),
  fuzzyWhitespace: z.boolean().optional(),
};

function textResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

export function createServer(): McpServer {
  const server = new McpServer({
    name: "editkit",
    version: "0.1.0",
  });

  server.registerTool(
    "parse_edits",
    {
      description:
        "Parse SEARCH/REPLACE blocks, unified diffs, and whole-file edits out of an LLM response. Returns the parsed edits sorted by their position in the source text. No file I/O.",
      inputSchema: parseEditsInput,
    },
    async ({ input, formats }) => {
      const edits = parseEdits(input, formats ? { formats } : undefined);
      return textResult(edits);
    },
  );

  server.registerTool(
    "apply_edits",
    {
      description:
        "Parse and apply edits in one call. Returns one ApplyResult per parsed edit, in source order. The result includes `before` and `after` strings on success, or `reason` + `message` on failure. The caller is responsible for writing changes to disk.",
      inputSchema: applyEditsInput,
    },
    async ({ input, files, formats, fuzzyWhitespace, allowCreate }) => {
      const results = applyEditsSync(input, files, {
        ...(formats ? { formats } : {}),
        ...(fuzzyWhitespace !== undefined ? { fuzzyWhitespace } : {}),
        ...(allowCreate !== undefined ? { allowCreate } : {}),
      });
      return textResult(results);
    },
  );

  server.registerTool(
    "detect_formats",
    {
      description:
        "Heuristic detector. Returns the formats that appear in the input string, in priority order. Useful as a pre-check before calling apply_edits.",
      inputSchema: detectFormatsInput,
    },
    async ({ input }) => textResult(detectFormats(input)),
  );

  server.registerTool(
    "fuzzy_replace",
    {
      description:
        "The matching primitive without the parsing layer. Given the original file contents, a SEARCH chunk, and a REPLACE chunk, returns the resulting text and which strategy matched. Returns `not-found` or `ambiguous` when the SEARCH chunk isn't uniquely locatable.",
      inputSchema: fuzzyReplaceInput,
    },
    async ({ original, search, replace, fuzzyWhitespace }) =>
      textResult(
        fuzzyReplace(original, search, replace, {
          fuzzyWhitespace: fuzzyWhitespace !== false,
        }),
      ),
  );

  return server;
}
