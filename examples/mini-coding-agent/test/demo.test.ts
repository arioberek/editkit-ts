import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runAgent } from "../src/agent.ts";
import { createMockLLM } from "../src/mock-llm.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

const TARGET_FILES = ["target/src/store.ts", "target/src/logger.ts", "target/src/index.ts"];

async function loadTarget(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const rel of TARGET_FILES) {
    out[rel] = await readFile(resolve(ROOT, rel), "utf8");
  }
  return out;
}

describe("mini-coding-agent demo", () => {
  it("scenario A: applies all three edit formats in a single LLM response", async () => {
    const initial = await loadTarget();
    const llm = createMockLLM([{ path: "scenario-multifile/round-1.txt" }]);
    const result = await runAgent({
      task: "Add TTL support, a meta-aware logger, and a ttl helper module.",
      files: initial,
      llm,
    });

    expect(result.success).toBe(true);
    expect(result.attempts).toHaveLength(1);

    const round1 = result.attempts[0];
    expect(round1).toBeDefined();
    if (!round1) return;

    expect(round1.attempted).toBe(3);
    expect(round1.succeeded).toBe(3);
    expect(round1.failures).toHaveLength(0);

    const formats = round1.events.map((e) => e.format).sort();
    expect(formats).toEqual(["search-replace", "unified-diff", "whole-file"]);

    const store = result.files["target/src/store.ts"];
    expect(store).toContain("ttlMs");
    expect(store).toContain("isExpired");
    expect(store).not.toContain("// TODO: support TTLs");

    const logger = result.files["target/src/logger.ts"];
    expect(logger).toContain("meta?: Record<string, unknown>");
    expect(logger).toContain("JSON.stringify(meta)");

    const ttl = result.files["target/src/ttl.ts"];
    expect(ttl).toBeDefined();
    expect(ttl).toContain("inMs");
    expect(ttl).toContain("inSeconds");
  });

  it("scenario B: round 1 fails with search-not-found, round 2 succeeds after retry", async () => {
    const initial = await loadTarget();
    const llm = createMockLLM([
      { path: "scenario-retry/round-1.txt" },
      { path: "scenario-retry/round-2.txt" },
    ]);

    const result = await runAgent({
      task: "Add a clear() method to the Store class.",
      files: initial,
      llm,
    });

    expect(result.success).toBe(true);
    expect(result.attempts.length).toBeGreaterThanOrEqual(2);

    const round1 = result.attempts[0];
    expect(round1).toBeDefined();
    if (!round1) return;
    expect(round1.failures.length).toBeGreaterThanOrEqual(1);
    const reason = round1.failures[0]?.reason;
    expect(["search-not-found", "ambiguous-match"]).toContain(reason ?? "");
    expect(round1.failures[0]?.message).toBeTruthy();

    const round2 = result.attempts[1];
    expect(round2).toBeDefined();
    if (!round2) return;
    expect(round2.failures).toHaveLength(0);
    expect(round2.succeeded).toBeGreaterThanOrEqual(1);

    const store = result.files["target/src/store.ts"];
    expect(store).toContain("clear()");
    expect(store).toContain("this.data.clear()");
  });

  it("does not mutate the input file map", async () => {
    const initial = await loadTarget();
    const before = JSON.parse(JSON.stringify(initial));
    const llm = createMockLLM([{ path: "scenario-multifile/round-1.txt" }]);
    await runAgent({ task: "anything", files: initial, llm });
    expect(initial).toEqual(before);
  });

  it("returns success=false with all attempts logged when retries are exhausted", async () => {
    const initial = await loadTarget();
    // Round 1 fixture intentionally fails (its SEARCH block is stale). With maxRetries=0
    // the agent gets exactly one shot, so the failure exhausts the budget immediately and
    // runAgent returns rather than asking the mock for another response.
    const llm = createMockLLM([{ path: "scenario-retry/round-1.txt" }]);

    const result = await runAgent({
      task: "Add a clear() method to the Store class.",
      files: initial,
      llm,
      maxRetries: 0,
    });

    expect(result.success).toBe(false);
    expect(result.attempts).toHaveLength(1);
    const round1 = result.attempts[0];
    expect(round1).toBeDefined();
    if (!round1) return;
    expect(round1.failures.length).toBeGreaterThanOrEqual(1);
    const reason = round1.failures[0]?.reason;
    expect(["search-not-found", "ambiguous-match"]).toContain(reason ?? "");
  });
});
