# MCP server example

An [MCP](https://modelcontextprotocol.io) server that exposes editkit's parsers and
appliers as tools. Drop it into Claude Desktop, Cursor, Continue, or any other MCP client
and an LLM can call `parse_edits`, `apply_edits`, `detect_formats`, and `fuzzy_replace`
directly.

The server is **pure** — none of the tools touch the filesystem. The caller supplies
current file contents and decides what to do with the result. This matches editkit's
design: it returns `before`/`after` strings; you decide whether to write them.

## Run the demo (in-memory, no MCP client needed)

```bash
# from the repo root, once:
bun install
bun run build

# then:
bun run --filter editkit-example-mcp-server demo
```

You'll see:

```
[demo] connected to editkit MCP server
[demo] tools: parse_edits, apply_edits, detect_formats, fuzzy_replace
[demo] detect_formats → ["search-replace"]
[demo] parse_edits → [{ "format": "search-replace", "path": "src/x.ts", ... }]...
[demo] apply_edits → 1 result(s), ok=1
[demo]   resulting file:
    before
    bar
    after
[demo] fuzzy_replace → { "kind": "ok", "text": "before\n  bar\nafter\n", "strategy": "indent-shift" }

✓ all tools responded
```

This is the same code path an MCP client takes, just over `InMemoryTransport` instead of
stdio.

## Wire into Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or the
equivalent on your platform:

```json
{
  "mcpServers": {
    "editkit": {
      "command": "bun",
      "args": ["run", "/absolute/path/to/editkit-ts/examples/mcp-server/src/index.ts"]
    }
  }
}
```

Restart Claude Desktop. The four tools should now show up in the MCP tools picker.

## Wire into the MCP Inspector

```bash
bunx @modelcontextprotocol/inspector bun run src/index.ts
```

(from inside `examples/mcp-server/`). The Inspector opens a browser UI where you can
trigger each tool with hand-crafted arguments — useful for prompt-engineering against the
server's tool schemas.

## Tools

| Tool | What it does |
|---|---|
| `parse_edits` | Parses SEARCH/REPLACE blocks, unified diffs, and whole-file edits out of an LLM response. Returns `ParsedEdit[]`. No file I/O. |
| `apply_edits` | Parses + applies in one call. Takes a `files` map of path → current contents. Returns `ApplyResult[]` with `before` and `after` strings on success or `reason` + `message` on failure. |
| `detect_formats` | Heuristic — returns which formats appear in the input, in priority order. |
| `fuzzy_replace` | The matching primitive: locate a SEARCH chunk and swap it for a REPLACE. Useful when you already parsed the edit yourself and just want the strategy. |

## Why pure tools

If the server wrote files directly, an LLM client would have to grant filesystem access to
every workspace it wanted to edit. By keeping the tools pure, the *client* stays in
control of which paths it reads (supplies the `files` map) and which writes go through
(applies the `after` strings). MCP's permission model maps cleanly to "let the model
propose edits; let the user confirm them".

## Files

```
examples/mcp-server/
├── README.md
├── package.json              # private; depends on editkit via workspace:* and @modelcontextprotocol/sdk
├── tsconfig.json
├── src/
│   ├── server.ts             # createServer() registering the four tools
│   ├── index.ts              # stdio entrypoint (the `editkit-mcp` bin)
│   └── demo.ts               # in-process demo using InMemoryTransport
└── test/
    └── server.test.ts        # bun:test e2e exercising every tool via in-memory transport
```
