/**
 * The mini coding agent.
 *
 * `runAgent` takes a task and an in-memory FileMap, asks an LLM to emit edits in any of
 * editkit's three formats, streams the model output through `streamEdits`, and applies
 * each edit as soon as its closing fence arrives. If any edits fail, it builds a follow-up
 * prompt that includes the structured failure messages verbatim and asks the model to try
 * again — up to `maxRetries` times.
 *
 * Nothing here writes to disk: the agent operates on `Record<string, string>` so the demo
 * is idempotent and the test can assert on the resulting in-memory file map directly.
 */

import type { ApplyResult } from "editkit";
import { streamEdits } from "editkit/ai-sdk";

export interface LLM {
  stream(prompt: { system: string; user: string }): AsyncIterable<string>;
}

export interface AttemptLog {
  round: number;
  attempted: number;
  succeeded: number;
  failures: Array<{ path: string; reason: string; message: string }>;
  events: Array<
    | { kind: "ok"; format: string; path: string }
    | { kind: "fail"; format: string; path: string; reason: string; message: string }
  >;
}

export interface RunAgentInput {
  task: string;
  files: Record<string, string>;
  llm: LLM;
  maxRetries?: number;
  /**
   * Optional callback fired for every yielded `{ edit, result }` so the demo can render
   * a live status line. The agent calls this in addition to recording the event.
   */
  onEvent?: (event: AttemptLog["events"][number], round: number) => void;
}

export interface RunAgentResult {
  files: Record<string, string>;
  attempts: AttemptLog[];
  /** True iff the final attempt produced zero failures. */
  success: boolean;
}

const SYSTEM_PROMPT = `You are a coding agent. Edit the user's files by emitting one or more
edit blocks. You may freely mix the following three formats in a single response:

1. SEARCH/REPLACE block (for surgical edits):

   path/to/file.ts
   <<<<<<< SEARCH
   ...exact lines from the existing file...
   =======
   ...what they should be replaced with...
   >>>>>>> REPLACE

   The SEARCH section must match the file's current contents exactly (whitespace and all).

2. Unified diff (for larger refactors):

   \`\`\`diff
   --- a/path/to/file.ts
   +++ b/path/to/file.ts
   @@ -L,N +L,N @@
    context
   -removed line
   +added line
    context
   \`\`\`

3. Whole-file block (for new files or full rewrites):

   path/to/new-file.ts
   \`\`\`ts
   ...full new contents...
   \`\`\`

Do not include any other commentary inside the edit blocks themselves. Outside the
blocks you may write short prose to explain your reasoning.`;

export async function runAgent(input: RunAgentInput): Promise<RunAgentResult> {
  const { task, llm, onEvent } = input;
  const maxRetries = input.maxRetries ?? 2;
  const files: Record<string, string> = { ...input.files };
  const attempts: AttemptLog[] = [];

  let userPrompt = buildInitialUserPrompt(task, files);

  for (let round = 1; round <= maxRetries + 1; round++) {
    const log: AttemptLog = {
      round,
      attempted: 0,
      succeeded: 0,
      failures: [],
      events: [],
    };

    const stream = llm.stream({ system: SYSTEM_PROMPT, user: userPrompt });

    // We tell the model it may freely mix all three formats, so we ask streamEdits to
    // parse all three. (The default `detectFormats` heuristic only returns whole-file
    // when no other format is present.)
    for await (const { edit, result } of streamEdits(stream, files, {
      formats: ["search-replace", "unified-diff", "whole-file"],
    })) {
      log.attempted++;
      if (isOk(result)) {
        files[result.path] = result.after;
        log.succeeded++;
        const ev = { kind: "ok" as const, format: edit.format, path: result.path };
        log.events.push(ev);
        onEvent?.(ev, round);
      } else {
        log.failures.push({
          path: result.path,
          reason: result.reason,
          message: result.message,
        });
        const ev = {
          kind: "fail" as const,
          format: edit.format,
          path: result.path,
          reason: result.reason,
          message: result.message,
        };
        log.events.push(ev);
        onEvent?.(ev, round);
      }
    }

    attempts.push(log);

    if (log.failures.length === 0) {
      return { files, attempts, success: true };
    }
    if (round > maxRetries) {
      break;
    }

    userPrompt = buildRetryPrompt(task, files, log);
  }

  return { files, attempts, success: false };
}

function isOk(result: ApplyResult): result is Extract<ApplyResult, { ok: true }> {
  return result.ok;
}

function buildInitialUserPrompt(task: string, files: Record<string, string>): string {
  const listing = Object.keys(files)
    .sort()
    .map((p) => renderFileBlock(p, files[p] ?? ""))
    .join("\n\n");
  return `Task: ${task}

Here is the current state of the project:

${listing}

Produce the edits needed to complete the task.`;
}

function buildRetryPrompt(
  task: string,
  files: Record<string, string>,
  lastAttempt: AttemptLog,
): string {
  const failureLines = lastAttempt.failures
    .map((f) => `- ${f.path} (${f.reason}): ${f.message}`)
    .join("\n");

  const affectedPaths = Array.from(new Set(lastAttempt.failures.map((f) => f.path)));
  const fileBlocks = affectedPaths
    .filter((p) => p in files)
    .map((p) => renderFileBlock(p, files[p] ?? ""))
    .join("\n\n");

  return `Task: ${task}

Your previous edits had these problems:

${failureLines}

Here is the current state of the affected files:

${fileBlocks}

Produce a corrected set of edits.`;
}

function renderFileBlock(path: string, contents: string): string {
  const lang = guessLang(path);
  return `${path}\n\`\`\`${lang}\n${contents}\`\`\``;
}

function guessLang(path: string): string {
  if (path.endsWith(".ts") || path.endsWith(".tsx")) return "ts";
  if (path.endsWith(".js") || path.endsWith(".jsx")) return "js";
  if (path.endsWith(".json")) return "json";
  if (path.endsWith(".md")) return "md";
  return "";
}
