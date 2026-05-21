# vitest-fixer

A real test-fix loop. Runs **vitest** against a buggy target codebase, on failure asks an
LLM for SEARCH/REPLACE blocks that fix the code, applies them via editkit, re-runs vitest.
One retry on failure, then bail — aider's canonical budget.

This is the same workflow as [`examples/agent-loop`](../agent-loop/), except the test step
is a real subprocess running real assertions instead of a stand-in regex.

## Run the demo (offline, no API key)

```bash
# from the repo root, once:
bun install
bun run build

# then:
bun run --filter editkit-example-vitest-fixer demo
```

You'll see:

```
[demo] mode: offline (set EDITKIT_DEMO_MODE=live to call OpenAI for real)
[demo] working in /tmp/editkit-vitest-fixer-XXXXXX
[fixer] attempt 1/2 — tests failing, asking model for a fix
[fixer]   ✓ applied edit to target/src/parseDuration.ts
[fixer] ✓ tests pass after 1 model call(s)

✓ fixer succeeded in 1 model call(s).
```

## Run with a real model

```bash
EDITKIT_DEMO_MODE=live OPENAI_API_KEY=sk-... bun run --filter editkit-example-vitest-fixer demo:live
```

`src/llm.ts` exposes both `createMockLLM` (offline, deterministic) and `createLiveLLM`
(calls OpenAI via the Vercel AI SDK). The fixer code only depends on the `LLM` interface,
so the rest is identical between modes.

## What's interesting here

- **Real test runner.** The fixer shells out to `bunx vitest run --reporter=verbose` and
  uses the exit code to decide whether to call the model. No assumptions about the test
  framework's API — anything that runs in a subprocess and exits non-zero on failure
  works.
- **Source-file context.** The retry prompt re-renders the *current* file contents
  (post-edit) alongside the failure messages. That's editkit's standard recipe — the
  failure message names the path and the problem but does not echo the SEARCH that
  failed, so fresh source is what the model re-quotes from.
- **One-retry budget.** If the second model call doesn't fix the tests, the fixer
  surfaces the failure and exits non-zero. Two model calls is the budget; more would
  burn tokens without higher pass rates (aider's empirical finding).
- **Workspace package import.** `editkit` is a `workspace:*` dep — the fixer imports
  `applyEdits` from the dist bundle, exercising the published interface the same way an
  npm consumer would.

## Run the test

```bash
bun run --filter editkit-example-vitest-fixer test
```

`test/fixer.test.ts` covers:

- A successful fix (offline mock returns the canonical patch → one model call → green).
- A give-up case (mock returns no edits → loop exhausts retries and reports failure).

## Files

```
examples/vitest-fixer/
├── README.md
├── package.json              # private; depends on editkit via workspace:*
├── tsconfig.json
├── target/                   # the buggy codebase the fixer is asked to fix
│   ├── vitest.config.ts
│   ├── src/parseDuration.ts  # missing the *1000/*60_000/*3_600_000 multipliers
│   └── tests/parseDuration.test.ts
├── fixtures/
│   └── round-1.txt           # canned LLM output that fixes the bug
├── src/
│   ├── llm.ts                # LLM interface, mock + live AI SDK adapter
│   ├── fixer.ts              # runFixer — the test-fix loop
│   └── demo.ts               # entry point
└── test/
    └── fixer.test.ts         # bun:test e2e using the mock LLM
```
