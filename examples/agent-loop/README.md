# Agent loop demo (test-fix workflow)

Reproduces aider's canonical test-fix loop end-to-end with a deterministic mock LLM, so it
runs without an API key and without flake.

```bash
# from the repo root:
bun install
bun run --filter editkit-example-agent-loop demo

# or directly:
cd examples/agent-loop
bun run demo
```

What it does:

1. Writes a buggy `src/math.ts` to a temp directory (`add` returns `a - b`).
2. Asks the "model" to fix the failing test.
3. The first response targets a function name that doesn't exist — editkit reports
   `search-not-found` with a model-readable message.
4. The retry feeds that message back; the model emits the real fix.
5. editkit applies it to disk; the demo confirms the source now uses `a + b`.

Swap `mockModel` for a real `generateText` call (Vercel AI SDK + your provider) and the same
loop drives a real coding agent.

Output:

```
[agent] working in /tmp/editkit-agent-loop-XXXXXX
[agent] initial source uses 'a - b' (bug)
[agent] attempt 1 failed:
  src/math.ts: Could not locate the SEARCH block in src/math.ts. ...
[agent] retrying with the parser's error fed back...
[agent] ✓ test passes after 2 model call(s)
[agent] final source:
    export function add(a: number, b: number) {
      return a + b;
    }
```
