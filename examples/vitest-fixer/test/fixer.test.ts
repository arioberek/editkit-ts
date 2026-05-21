import { afterEach, beforeEach, expect, test } from "bun:test";
/**
 * E2E test for the fixer using the offline mock LLM. Verifies that the buggy
 * parseDuration in target/ ends up with all tests passing after one model call.
 */
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runFixer } from "../src/fixer.ts";
import { createMockLLM } from "../src/llm.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXAMPLE_ROOT = join(__dirname, "..");

let tmp: string;

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "editkit-vitest-fixer-test-"));
  await cp(join(EXAMPLE_ROOT, "target"), join(tmp, "target"), { recursive: true });
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

test("fixer makes a failing vitest suite pass in one model call", async () => {
  const fixture = await readFile(join(EXAMPLE_ROOT, "fixtures/round-1.txt"), "utf8");
  const llm = createMockLLM([
    {
      matches: ["parseDuration", "FAIL"],
      text: fixture,
    },
  ]);

  const result = await runFixer({
    cwd: tmp,
    llm,
    maxRetries: 1,
    log: () => {},
  });

  expect(result.success).toBe(true);
  expect(result.modelCalls).toBe(1);
  expect(result.lastFailures).toHaveLength(0);
});

test("fixer gives up after maxRetries when the model can't fix the bug", async () => {
  // Mock LLM that returns a no-op edit no matter the prompt
  const llm = createMockLLM([
    {
      text: "I don't see anything to fix.",
    },
  ]);

  const result = await runFixer({
    cwd: tmp,
    llm,
    maxRetries: 1,
    log: () => {},
  });

  expect(result.success).toBe(false);
  expect(result.modelCalls).toBe(2); // attempt + 1 retry
});
