/**
 * Runnable demo. Two scenarios:
 *
 *   A) "multifile" — a single LLM response uses all three edit formats across three files.
 *   B) "retry"     — the first response has a wrong SEARCH block; the agent feeds the
 *                    structured failure message back to the LLM and the second response fixes it.
 *
 * Defaults to the offline mock LLM (no API key required). Set `EDITKIT_DEMO_MODE=live`
 * and `OPENAI_API_KEY` (or use the `demo:live` script) to switch to the live OpenAI
 * adapter — though note that with a non-deterministic model, the precise edits may
 * differ from the recorded fixtures.
 */

import { readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type AttemptLog, type LLM, runAgent } from "./agent.ts";
import { createMockLLM } from "./mock-llm.ts";

const HERE = dirname(fileURLToPath(import.meta.url));

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
};

const TARGET_FILES = ["target/src/store.ts", "target/src/logger.ts", "target/src/index.ts"];

const TASK_MULTIFILE =
  "Add TTL support to the Store class, extend the logger to accept an optional `meta` " +
  "object, and add a `target/src/ttl.ts` helper module with `inMs`/`inSeconds` functions.";

const TASK_RETRY = "Add a `clear()` method to the Store class.";

async function loadInitialFiles(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const rel of TARGET_FILES) {
    const abs = resolve(HERE, "..", rel);
    out[rel] = await readFile(abs, "utf8");
  }
  return out;
}

function selectLLM(scenario: "multifile" | "retry"): LLM {
  if (scenario === "multifile") {
    return createMockLLM([{ path: "scenario-multifile/round-1.txt" }]);
  }
  return createMockLLM([
    { path: "scenario-retry/round-1.txt" },
    { path: "scenario-retry/round-2.txt" },
  ]);
}

async function selectLLMOrLive(scenario: "multifile" | "retry"): Promise<LLM> {
  const wantsLive = process.env.EDITKIT_DEMO_MODE === "live" && process.env.OPENAI_API_KEY;
  if (!wantsLive) return selectLLM(scenario);

  try {
    const { createOpenAILLM } = await import("./openai-llm.ts");
    console.log(
      `${C.dim}(live mode: using OpenAI; unset EDITKIT_DEMO_MODE to use the offline mock)${C.reset}`,
    );
    return await createOpenAILLM();
  } catch (err) {
    console.warn(`${C.yellow}live mode unavailable, falling back to mock${C.reset}`);
    console.warn(`${C.dim}${(err as Error).message}${C.reset}`);
    return selectLLM(scenario);
  }
}

function header(text: string, color: string): void {
  const bar = "═".repeat(Math.max(0, 70 - text.length - 2));
  console.log(`\n${color}${C.bold}${text} ${bar}${C.reset}`);
}

function sub(text: string): void {
  console.log(`\n${C.bold}${text}${C.reset}`);
}

function renderAttempt(log: AttemptLog): void {
  sub(
    `Round ${log.round} — ${log.attempted} edits attempted, ${log.succeeded} ok, ${log.failures.length} failed`,
  );
  for (const ev of log.events) {
    if (ev.kind === "ok") {
      console.log(`  ${C.green}✓${C.reset} ${ev.format.padEnd(14)} ${ev.path}`);
    } else {
      console.log(
        `  ${C.red}✗${C.reset} ${ev.format.padEnd(14)} ${ev.path}  ${C.red}[${ev.reason}]${C.reset}`,
      );
      const indented = ev.message
        .split("\n")
        .map((l) => `      ${C.dim}${l}${C.reset}`)
        .join("\n");
      console.log(indented);
    }
  }
}

function renderFiles(before: Record<string, string>, after: Record<string, string>): void {
  const allPaths = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).sort();
  const changed = allPaths.filter((p) => (before[p] ?? "") !== (after[p] ?? ""));

  if (changed.length === 0) {
    console.log(`\n${C.dim}(no files changed)${C.reset}`);
    return;
  }

  sub("Modified files (first ~20 lines each)");
  for (const path of changed) {
    const wasNew = !(path in before);
    const tag = wasNew ? `${C.cyan}[new]${C.reset}` : `${C.blue}[modified]${C.reset}`;
    console.log(`\n  ${tag} ${path}`);
    const lines = (after[path] ?? "").split("\n").slice(0, 20);
    for (const line of lines) {
      console.log(`    ${C.dim}│${C.reset} ${line}`);
    }
    const total = (after[path] ?? "").split("\n").length;
    if (total > 20) {
      console.log(`    ${C.dim}│ … (${total - 20} more lines)${C.reset}`);
    }
  }
}

async function runScenario(
  name: string,
  task: string,
  initial: Record<string, string>,
  llm: LLM,
  color: string,
): Promise<{ success: boolean; attempts: AttemptLog[] }> {
  header(`Scenario: ${name}`, color);
  console.log(`${C.dim}Task: ${task}${C.reset}`);

  const result = await runAgent({ task, files: initial, llm });

  for (const log of result.attempts) renderAttempt(log);
  renderFiles(initial, result.files);

  const verdict = result.success
    ? `${C.green}✓ scenario succeeded${C.reset}`
    : `${C.red}✗ scenario ended with unresolved failures${C.reset}`;
  console.log(`\n${verdict}`);

  return { success: result.success, attempts: result.attempts };
}

async function main(): Promise<void> {
  const initial = await loadInitialFiles();

  console.log(`${C.bold}editkit mini-coding-agent demo${C.reset}`);
  console.log(`${C.dim}target files (${TARGET_FILES.length}):${C.reset}`);
  for (const p of TARGET_FILES) {
    console.log(`  ${C.dim}- ${relative(".", p)}${C.reset}`);
  }

  const a = await runScenario(
    "A — multi-file mixed-format",
    TASK_MULTIFILE,
    initial,
    await selectLLMOrLive("multifile"),
    C.magenta,
  );

  const b = await runScenario(
    "B — failure → retry recovery",
    TASK_RETRY,
    initial,
    await selectLLMOrLive("retry"),
    C.cyan,
  );

  if (b.attempts.length < 2 || b.attempts[0]?.failures.length === 0) {
    console.log(
      `\n${C.yellow}note: scenario B did not exercise the retry path this run ` +
        `(round 1 had no failures).${C.reset}`,
    );
  } else {
    console.log(
      `\n${C.green}retry loop verified:${C.reset} round 1 failed with ${C.bold}${b.attempts[0]?.failures[0]?.reason}${C.reset} → round 2 succeeded after the agent fed the failure message back to the LLM.`,
    );
  }

  if (!a.success || !b.success) {
    console.error(`${C.red}one or more scenarios failed${C.reset}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
