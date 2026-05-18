# editkit

[![CI](https://github.com/arioberek/editkit-ts/actions/workflows/ci.yml/badge.svg)](https://github.com/arioberek/editkit-ts/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/editkit.svg)](https://www.npmjs.com/package/editkit)
[![npm downloads](https://img.shields.io/npm/dm/editkit.svg)](https://www.npmjs.com/package/editkit)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Bundle size](https://img.shields.io/bundlephobia/minzip/editkit?label=minzip)](https://bundlephobia.com/package/editkit)

**Robust LLM edit-format toolkit for TypeScript.** Parse and apply `SEARCH/REPLACE` blocks, unified diffs, and whole-file edits — with fuzzy whitespace matching ported from [aider](https://github.com/paul-gauthier/aider).

```bash
npm i editkit
# or: pnpm add editkit / bun add editkit
```

## Why this exists

Every TS coding agent today (Continue, Cline, T3 Code, Mastra, custom AI SDK apps) ends up reinventing the same logic: take an LLM's response, find the edits inside it, and apply them to local files. Aider has the most battle-tested implementation in any language — it just happens to be Python.

`editkit` ports aider's edit-format design to TypeScript with a clean public API and a Vercel AI SDK adapter, so you can stop rewriting "search/replace block parser" for the third time.

It supports the three formats real models actually emit:

| Format            | When to use it                                            |
| ----------------- | --------------------------------------------------------- |
| `search-replace`  | Default for any model. Compact, focused, easy for small models. |
| `unified-diff`    | Best for large refactors and multi-hunk changes.          |
| `whole-file`      | Smallest models, or files <50 lines.                      |

The applier handles the messy reality:

- **Indent-shift fuzzy matching** — when the model dropped the indentation of a nested block, the search still locates it and the replace is re-indented to fit.
- **Trailing-whitespace tolerance** — finds matches when the file has trailing spaces the model didn't quote.
- **Hunk drift** — unified diffs locate their target even when line numbers are off.
- **Overlay semantics** — multiple edits to the same file see each other's output, in source order.
- **Structured failures** — every failure has a `reason` (`search-not-found`, `ambiguous-match`, `hunk-context-mismatch`, …) and a human-readable message you can pipe back into a retry prompt.

Zero runtime dependencies. ESM-only. Node 18+.

## Quick start

```ts
import { applyEdits } from "editkit";
import { readFile, writeFile } from "node:fs/promises";

const llmOutput = `
src/util.ts
<<<<<<< SEARCH
export const x = 1;
=======
export const x = 2;
>>>>>>> REPLACE
`;

const results = await applyEdits(llmOutput, async (path) => {
  return await readFile(path, "utf8");
});

for (const r of results) {
  if (r.ok) {
    await writeFile(r.path, r.after);
    console.log(`✓ ${r.path}`);
  } else {
    console.error(`✗ ${r.path}: ${r.message}`);
  }
}
```

## Vercel AI SDK — streaming

Apply edits as the model emits them, file by file:

```ts
import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";
import { streamEdits } from "editkit/ai-sdk";
import { readFile, writeFile } from "node:fs/promises";

const { textStream } = await streamText({
  model: openai("gpt-4o"),
  system: SEARCH_REPLACE_PROMPT, // see "System prompts" below
  prompt: "Refactor src/util.ts to use a class instead of free functions.",
});

for await (const { edit, result } of streamEdits(textStream, async (p) =>
  readFile(p, "utf8"),
)) {
  if (result.ok) {
    await writeFile(result.path, result.after);
    console.log(`✓ applied ${edit.format} to ${result.path}`);
  } else {
    console.warn(`✗ ${result.path}: ${result.message}`);
  }
}
```

## Recipes

Patterns from aider's real workflows, ported to TypeScript. Pick the format that fits the task; mix formats in one response when needed.

### Test-fix loop

Failing test in, fix attempt out. Retry once with the parser's error fed back, then bail. This is the canonical aider loop.

```ts
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { applyEdits } from "editkit";
import { readFile, writeFile } from "node:fs/promises";

async function attempt(prompt: string) {
  const { text } = await generateText({
    model: openai("gpt-4o"),
    system: SEARCH_REPLACE_PROMPT,
    prompt,
  });
  const results = await applyEdits(text, (p) => readFile(p, "utf8"));
  for (const r of results) if (r.ok) await writeFile(r.path, r.after);
  return results.filter((r) => !r.ok);
}

const failures = await attempt(
  `Fix the code so this test passes:\n\n${testOutput.slice(0, 2000)}`,
);
if (failures.length) {
  await attempt(
    `Your previous edit failed:\n${failures.map((f) => `${f.path}: ${f.message}`).join("\n")}\n\nTry again.`,
  );
}
```

### Bulk codemod across a directory

One file, one model call, one commit. A bad pass becomes a single revert.

```ts
import { glob } from "glob";
import { $ } from "bun";

for (const path of await glob("src/**/*.ts")) {
  const source = await readFile(path, "utf8");
  const { text } = await generateText({
    model: openai("gpt-4o-mini"),
    system: WHOLE_FILE_PROMPT,
    prompt: `Add JSDoc to every exported symbol in ${path}:\n\n\`\`\`ts\n${source}\n\`\`\``,
  });
  const [r] = await applyEdits(text, { [path]: source }, { formats: ["whole-file"] });
  if (r?.ok) {
    await writeFile(path, r.after);
    await $`git commit -am ${`docs: jsdoc for ${path}`}`;
  }
}
```

### Multi-file refactor

Add `--verbose` and thread it through every call site. SEARCH/REPLACE handles N files in one response and applies them in source order, so later edits to the same file see the earlier ones.

```ts
const FILES = ["src/cli.ts", "src/config.ts", "src/runner.ts", "src/log.ts"];
const contents = Object.fromEntries(
  await Promise.all(FILES.map(async (p) => [p, await readFile(p, "utf8")] as const)),
);

const fileSection = FILES
  .map((p) => `### ${p}\n\`\`\`ts\n${contents[p]}\n\`\`\``)
  .join("\n\n");

const { text } = await generateText({
  model: openai("gpt-4o"),
  system: SEARCH_REPLACE_PROMPT,
  prompt: `Add a --verbose flag and thread it through every file below.\n\n${fileSection}`,
});

const results = await applyEdits(text, contents);
const conflicts = results.filter((r) => !r.ok);
if (conflicts.length) {
  for (const c of conflicts) console.error(`✗ ${c.path}: ${c.message}`);
  process.exit(1);
}
for (const r of results) if (r.ok) await writeFile(r.path, r.after);
```

### Architect / editor split

Strong reasoning model writes the plan. The cheap fast editor model turns the plan into edit blocks, seeing only the plan and the file (never the user prompt). On aider's benchmarks this doubled diff-format pass rates for hard tasks.

```ts
import { anthropic } from "@ai-sdk/anthropic";

const file = await readFile("src/auth.ts", "utf8");

const { text: plan } = await generateText({
  model: anthropic("claude-opus-4-7"),
  prompt: `Sketch the diff for adding OAuth alongside email auth in src/auth.ts. List the exact functions to add, change, or remove.\n\n\`\`\`ts\n${file}\n\`\`\``,
});

const { text: edits } = await generateText({
  model: openai("gpt-4o-mini"),
  system: SEARCH_REPLACE_PROMPT,
  prompt: `Turn this plan into SEARCH/REPLACE blocks for src/auth.ts:\n\n${plan}\n\n\`\`\`ts\n${file}\n\`\`\``,
});

const results = await applyEdits(edits, { "src/auth.ts": file });
```

### Lint-after-edit auto-fix

Apply, lint the touched files, feed lint errors back. Catches malformed edits before they reach the commit.

```ts
import { $ } from "bun";

const results = await applyEdits(llmOutput, (p) => readFile(p, "utf8"));
const written: string[] = [];
for (const r of results) {
  if (!r.ok) continue;
  await writeFile(r.path, r.after);
  written.push(r.path);
}

const lint = await $`biome check ${written}`.nothrow();
if (lint.exitCode !== 0) {
  const { text } = await generateText({
    model: openai("gpt-4o"),
    system: SEARCH_REPLACE_PROMPT,
    prompt: `Fix these lint errors:\n${lint.stdout.toString()}`,
  });
  const fix = await applyEdits(text, (p) => readFile(p, "utf8"));
  for (const r of fix) if (r.ok) await writeFile(r.path, r.after);
}
```

### GitHub PR review bot

Webhook fires on a `/fix` comment. The model writes a unified diff that the bot commits back to the PR branch.

```ts
// Inside an octokit webhook handler
const { data: file } = await octokit.repos.getContent({
  owner, repo, path, ref: pr.head.sha,
});
const original = Buffer.from((file as any).content, "base64").toString();

const { text } = await generateText({
  model: openai("gpt-4o"),
  system: UNIFIED_DIFF_PROMPT,
  prompt: `Apply this reviewer feedback to ${path}:\n\n> ${comment.body}\n\n\`\`\`\n${original}\n\`\`\``,
});

const [r] = await applyEdits(text, { [path]: original }, { formats: ["unified-diff"] });
if (!r?.ok) {
  await octokit.issues.createComment({
    owner, repo, issue_number: pr.number,
    body: `Couldn't apply: ${r?.message ?? "no edits parsed"}`,
  });
  return;
}

await octokit.repos.createOrUpdateFileContents({
  owner, repo, path,
  branch: pr.head.ref,
  sha: (file as any).sha,
  message: `fix: ${comment.body.slice(0, 60)}`,
  content: Buffer.from(r.after).toString("base64"),
});
```

### Slack-driven edits

Mention the bot, name a file, say what to do. The bot pushes a branch.

```ts
app.event("app_mention", async ({ event, say }) => {
  const m = event.text.match(/edit (\S+) (.+)/);
  if (!m) return say("Usage: @bot edit <path> <instruction>");
  const [, path, instruction] = m;

  const original = await readFile(path, "utf8");
  const { text } = await generateText({
    model: openai("gpt-4o"),
    system: SEARCH_REPLACE_PROMPT,
    prompt: `${instruction}\n\n\`\`\`\n${original}\n\`\`\``,
  });
  const [r] = await applyEdits(text, { [path]: original });
  if (!r?.ok) return say(`Couldn't apply: ${r?.message ?? "no edits"}`);

  await writeFile(path, r.after);
  await $`git checkout -b ${`slack/${event.ts}`} && git commit -am ${instruction} && git push -u origin HEAD`;
  await say(`Pushed branch \`slack/${event.ts}\``);
});
```

### Framework migration with unified diffs

Multi-hunk changes per file: Next 13 → 15, React class → hooks, Express 4 → 5. Unified diff outperforms SEARCH/REPLACE here because the diff structure stops the model from emitting `// ...rest unchanged` placeholders.

```ts
const page = await readFile("app/products/[id]/page.tsx", "utf8");
const { text } = await generateText({
  model: openai("gpt-4o"),
  system: UNIFIED_DIFF_PROMPT,
  prompt: `Migrate this Next 13 page to Next 15: async params, new metadata API, new caching defaults.\n\n\`\`\`tsx\n${page}\n\`\`\``,
});
const [r] = await applyEdits(
  text,
  { "app/products/[id]/page.tsx": page },
  { formats: ["unified-diff"] },
);
if (r?.ok) await writeFile(r.path, r.after);
```

### Cross-language port (file creation)

Whole-file with `allowCreate` (the default) handles new paths. Useful for language ports, scaffolding generators, "explain this and write the test" prompts.

```ts
const py = await readFile("src/parser.py", "utf8");
const { text } = await generateText({
  model: openai("gpt-4o"),
  system: WHOLE_FILE_PROMPT,
  prompt: `Port this Python module to Rust. Output as src/parser.rs:\n\n\`\`\`py\n${py}\n\`\`\``,
});
const [r] = await applyEdits(text, async () => null, { formats: ["whole-file"] });
if (r?.ok) await writeFile(r.path, r.after);
```

### Live diff preview UI

`streamEdits` yields each completed edit the moment its closing fence arrives. Flicker each file's diff into the UI before the model finishes the whole response.

```ts
import { streamEdits } from "editkit/ai-sdk";
import { diffLines } from "diff";

for await (const { edit, result } of streamEdits(textStream, (p) => readFile(p, "utf8"))) {
  if (!result.ok) {
    ws.send({ type: "edit-error", path: result.path, reason: result.reason, message: result.message });
    continue;
  }
  ws.send({
    type: "edit-preview",
    path: result.path,
    format: edit.format,
    diff: diffLines(result.before, result.after),
  });
}
```

## Examples

See the [examples/](./examples) directory for runnable demos. The [mini-coding-agent](./examples/mini-coding-agent) example runs offline (no API key required) and shows multi-file edits, mixed formats, and structured-failure retry recovery.

## API

### `parseEdits(input, options?)`

Parse all edits from an LLM response. Returns a sorted array of `ParsedEdit`s. No file I/O.

```ts
import { parseEdits } from "editkit";

const edits = parseEdits(llmOutput);
// [{ format: "search-replace", path: "src/util.ts", search: "...", replace: "...", range: {...} }]
```

Pass `{ formats: ["search-replace"] }` to restrict parsing to a single format (useful when you've prompted the model in one format and want hard-fails on the others).

### `applyEdits(input, files, options?)`

Parse and apply in one async call. Returns one `ApplyResult` per parsed edit, in source order.

```ts
import { applyEdits } from "editkit";

const results = await applyEdits(llmOutput, {
  "src/util.ts": "export const x = 1;\n",
});
```

`files` is either:
- A `Record<string, string>` (path → current contents), or
- An async function `(path: string) => Promise<string | null>`.

Return `null` (or throw) for paths that don't exist; the applier will treat the edit as a "create" if the format and `allowCreate` (default `true`) permit.

### `applyEditsSync(input, files, options?)`

Synchronous variant. Requires a `Record<string, string>` (no async file reader). Useful in tests and in environments where you've pre-loaded everything into memory.

### `streamEdits(stream, files, options?)` *(in `editkit/ai-sdk`)*

Async iterable that yields `{ edit, result }` for each completed edit as soon as its closing fence has streamed in.

### `fuzzyReplace(original, search, replace, options?)`

Exposed as a primitive in case you want the matching logic without the parsing layer. Returns `{ kind: "ok"; text; strategy }`, `{ kind: "ambiguous"; count }`, or `{ kind: "not-found" }`.

### `detectFormats(input)`

Heuristic detector. Returns the formats that appear in `input`, in priority order.

## Failure handling

Every `ApplyResult` is either `{ ok: true, before, after, edit, path }` or `{ ok: false, reason, message, edit, path }`.

The `reason` codes:

| reason                     | what it means                                                      |
| -------------------------- | ------------------------------------------------------------------ |
| `search-not-found`         | The SEARCH block doesn't appear in the file (even with fuzzing).   |
| `ambiguous-match`          | The SEARCH block appears more than once.                           |
| `hunk-context-mismatch`    | A unified-diff hunk's context lines don't appear in the file.      |
| `missing-original`         | The file doesn't exist and `allowCreate` is `false`.               |
| `invalid-format`           | The block can't be parsed.                                         |

Pipe `result.message` straight back into a retry prompt — the messages are written to be model-readable.

## System prompts

If you're using `editkit` to apply LLM output, you'll get the best results by prompting the model in a specific edit format. These prompts are pasted from aider's reference prompts (which have been tested against dozens of models):

### SEARCH/REPLACE blocks

```
When you propose a code change, output it as one or more SEARCH/REPLACE blocks. Each block must look like this exactly, including the punctuation:

PATH/TO/FILE
<<<<<<< SEARCH
...exact lines from the existing file...
=======
...what they should be replaced with...
>>>>>>> REPLACE

Rules:
- The file path must be on the line directly above the <<<<<<< SEARCH line.
- The SEARCH section must contain a UNIQUE chunk of the file, copied verbatim including indentation. If a function appears multiple times, include surrounding lines until the chunk is unique.
- To create a new file, use an empty SEARCH section.
- To delete code, use an empty REPLACE section.
- Output multiple blocks in one reply when there are multiple changes; do not bundle unrelated changes into one block.
- Do not output any other format of code edit. Do not output diffs.
```

### Unified diff

```
When you propose a code change, output it as a unified diff. Each diff must look like:

--- a/PATH/TO/FILE
+++ b/PATH/TO/FILE
@@ -OLD_START,OLD_LINES +NEW_START,NEW_LINES @@
 unchanged context
-removed line
+added line
 unchanged context

Rules:
- Always include 3 lines of context before and after each change.
- Use /dev/null as the source path when creating a new file.
- For deletes, use /dev/null as the destination path.
- Do not output any other format of code edit.
```

### Whole-file

````
When you propose a code change, output the file's new full contents. Each file must look like:

PATH/TO/FILE
```LANGUAGE
... full file contents ...
```

Rules:
- The path goes on the line above the opening fence.
- The fence language is informational; ```ts, ```py, etc.
- Output one fenced block per file. Do not omit any lines.
````

## Comparison

| Project | Language | Formats supported | Streaming | Fuzzy matching |
| ------- | -------- | ----------------- | --------- | -------------- |
| **editkit** | TypeScript | search-replace, unified-diff, whole-file | yes (AI SDK) | yes (3 strategies) |
| [aider](https://github.com/paul-gauthier/aider) | Python | all of the above + 4 more | n/a | yes (origin of the algorithms) |
| [nocapro/apply-multi-diff](https://github.com/nocapro/apply-multi-diff) | TypeScript | search-replace, unified-diff | no | partial |

If you need *more* edit formats (architect, ask, etc.) — use aider via subprocess. If you need them in TS, file an issue.

## Status

`v0.1.x` — public API stable, more aider parity coming. Test suite covers 40+ adversarial fixtures including: 7+-character fence drift, inline path on the SEARCH line, path inside the SEARCH block, fenced ``` inside SEARCH/REPLACE bodies, drifted unified-diff hunk numbers, CRLF preservation, multi-file inputs, and consecutive edits to the same file.

## Contributing

PRs welcome. See [CONTRIBUTING.md](https://github.com/arioberek/editkit-ts/blob/main/CONTRIBUTING.md) for setup, testing, and the changeset-based release flow. Issues and discussions live on [GitHub](https://github.com/arioberek/editkit-ts).

## License

MIT. Portions of the algorithm design (the SEARCH/REPLACE fuzzy strategies) are ports of aider's MIT-licensed code; see `LICENSE` for the original copyright.
