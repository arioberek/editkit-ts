# mini-coding-agent

A small coding agent (~530 LOC across 4 files in `src/`) that takes a natural-language
task, edits multiple files in real time as the LLM streams its response, and recovers
from failed edits by feeding editkit's structured failure messages back to the model.
Runs **offline by default** — no API key required — by replaying pre-recorded LLM
transcripts through the same `streamEdits` code path a real model uses.

## Why this proves editkit is useful

Without editkit, the things this example does for you would each be a small project:

- **Parse three edit formats** in one response: SEARCH/REPLACE blocks, unified diffs, and
  whole-file blocks. The agent doesn't have to choose a format — the model picks whatever
  fits the change, and editkit handles the rest.
- **Fuzzy whitespace match** so SEARCH blocks still apply when the model drifts on
  indentation.
- **Streaming buffer** that knows when an edit is *complete* (closing fence has arrived)
  so the UI can flicker each diff in as it lands instead of waiting for end-of-response.
- **Structured failure** with a `reason` code (`search-not-found`, `ambiguous-match`,
  `hunk-context-mismatch`, ...) and a `message` string written to be model-readable. The
  retry loop in `src/agent.ts` builds the next user prompt out of editkit's structured
  `reason` + `message` strings *plus* a re-render of the affected files' current contents.
  Both pieces matter: the failure message names the path and the problem but does not
  echo the SEARCH block that failed to match, so the re-rendered file is what gives the
  model fresh source to re-quote from.
- **Multi-edit-same-file overlay** so two SEARCH/REPLACE blocks in one response that both
  edit `store.ts` see each other's output.
- **Format opt-in is a sharp edge worth knowing about.** editkit's default `detectFormats`
  only returns `whole-file` when no SEARCH/REPLACE or unified-diff markers are present in
  the response, so a mixed response (like the multifile fixture) would silently drop the
  whole-file block under the default detector. This example passes an explicit
  `formats: ["search-replace", "unified-diff", "whole-file"]` to `streamEdits` so all
  three are parsed. If you build your own agent that prompts for mixed formats, do the
  same.

## Run the demo (offline, no API key)

```bash
# Once, at the repo root: install workspaces and build editkit:
bun install
bun run build

# Then run the demo from this directory:
cd examples/mini-coding-agent
bun run demo

# Or, from the repo root:
bun run --filter editkit-example-mini-coding-agent demo
```

You'll see two scenarios run end-to-end:

1. **Scenario A — multi-file mixed-format.** A single LLM response uses a SEARCH/REPLACE
   block on `store.ts`, a unified-diff on `logger.ts`, and a whole-file block creating a
   new `ttl.ts`. All three apply in one pass.

2. **Scenario B — failure → retry recovery.** The first response quotes a stale
   `delete(key)` signature and fails with `search-not-found`. The agent feeds the failure
   message (and the current contents of the affected file) back to the LLM, which (in the
   second fixture) emits a corrected SEARCH/REPLACE block. Round 2 succeeds.

## Run with a real model

```bash
EDITKIT_DEMO_MODE=live OPENAI_API_KEY=sk-... bun run demo:live
```

Live mode is opt-in: the demo only calls OpenAI when `EDITKIT_DEMO_MODE=live` is set
(`demo:live` sets it for you). Without that env var, the demo always uses the offline mock,
even if `OPENAI_API_KEY` happens to be in your environment, so you can run `bun run demo`
in any shell without worrying about accidentally burning API quota.

`src/openai-llm.ts` wraps `streamText` from the AI SDK into the same `LLM` interface the
mock uses, so the rest of the agent code is identical. The `ai` and `@ai-sdk/openai`
packages are listed as devDependencies (so types resolve cleanly during typecheck) but the
import inside `openai-llm.ts` is dynamic — the offline demo still works if you remove
those packages.

## What to look at

- **`src/agent.ts`** — the `runAgent` function. The retry loop is the punchline: when an
  edit fails, the next user prompt combines editkit's structured `reason` + `message`
  strings with a re-render of the affected files' current contents, so the model has
  both the diagnosis and fresh source to re-quote from.
- **`src/mock-llm.ts`** — yields fixture text in chunks of varying small sizes so the
  streaming code path is exercised the same way it would be with a live model.
- **`fixtures/scenario-multifile/round-1.txt`** — what an LLM emits when it wants to make
  three edits across three files in three different formats. This is the wire format,
  not a JSON envelope.
- **`fixtures/scenario-retry/round-1.txt` and `round-2.txt`** — the broken-then-fixed
  pair. Compare them to see what the model is asked to fix between rounds.

## Run the test

```bash
bun test
```

The test asserts on the same behavior the demo prints: scenario A has 3 edits (one per
format) all succeeding, scenario B has at least one `search-not-found` failure in round 1
and a clean round 2.

## Files

```
examples/mini-coding-agent/
├── README.md
├── package.json              # private; depends on editkit via workspace:*
├── tsconfig.json             # extends ../../packages/editkit/tsconfig.json
├── target/                   # the small fake codebase the agent edits
│   └── src/
│       ├── store.ts          # in-memory KV store with a TODO marker
│       ├── logger.ts         # log() with a stale signature
│       └── index.ts          # wires them together
├── fixtures/                 # pre-recorded LLM transcripts (plain text)
│   ├── scenario-multifile/round-1.txt
│   └── scenario-retry/{round-1.txt,round-2.txt}
├── src/
│   ├── agent.ts              # runAgent — streaming + retry loop
│   ├── mock-llm.ts           # createMockLLM — yields fixtures in chunks
│   ├── openai-llm.ts         # createOpenAILLM — wraps the AI SDK
│   └── demo.ts               # entry point; picks mock or live based on env
└── test/
    └── demo.test.ts          # bun:test e2e test using the mock LLM
```
