/**
 * Demo runner. Sets up a fresh copy of the target codebase in a temp directory, runs the
 * fixer, prints the result.
 *
 * By default uses an offline mock LLM that replays the fixture in `fixtures/`. Set
 * `EDITKIT_DEMO_MODE=live` (or use `bun run demo:live`) to call OpenAI for real.
 */
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runFixer } from "./fixer.ts";
import { type LLM, createLiveLLM, createMockLLM } from "./llm.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXAMPLE_ROOT = join(__dirname, "..");

async function main() {
  const tmp = await mkdtemp(join(tmpdir(), "editkit-vitest-fixer-"));
  console.log(`[demo] working in ${tmp}`);

  try {
    // Copy the target codebase into the temp dir so fixes don't mutate the fixture.
    await cp(join(EXAMPLE_ROOT, "target"), join(tmp, "target"), { recursive: true });

    const llm = await pickLLM();
    const result = await runFixer({
      cwd: tmp,
      llm,
      maxRetries: 1,
      log: console.log,
    });

    if (result.success) {
      console.log(`\n\x1b[32m✓ fixer succeeded\x1b[0m in ${result.modelCalls} model call(s).`);
    } else {
      console.log("\n\x1b[31m✗ fixer failed\x1b[0m. Final test output:\n");
      console.log(result.finalTestOutput);
      process.exitCode = 1;
    }
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

async function pickLLM(): Promise<LLM> {
  if (process.env.EDITKIT_DEMO_MODE === "live") {
    console.log("[demo] mode: live (calls OpenAI)");
    return createLiveLLM();
  }
  console.log("[demo] mode: offline (set EDITKIT_DEMO_MODE=live to call OpenAI for real)");
  const fixture = await readFile(join(EXAMPLE_ROOT, "fixtures/round-1.txt"), "utf8");
  return createMockLLM([
    {
      matches: ["parseDuration", "FAIL"],
      text: fixture,
    },
  ]);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
