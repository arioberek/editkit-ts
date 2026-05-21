/**
 * vitest-fixer — runs vitest, on failure asks the model to emit SEARCH/REPLACE blocks,
 * applies them with editkit, re-runs the tests. One retry, then bail.
 *
 * This is aider's canonical test-fix loop wired to an actual test runner instead of a
 * deterministic mock. Compare with examples/agent-loop, which uses a stand-in for the
 * test step.
 */
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type ApplyResult, applyEdits } from "editkit";
import type { LLM } from "./llm.ts";

const SYSTEM_PROMPT = `When you propose a code change, output it as one or more SEARCH/REPLACE blocks. Each block must look like this exactly, including the punctuation:

PATH/TO/FILE
<<<<<<< SEARCH
...exact lines from the existing file...
=======
...what they should be replaced with...
>>>>>>> REPLACE

Rules:
- The file path must be on the line directly above the <<<<<<< SEARCH line.
- The SEARCH section must contain a UNIQUE chunk of the file, copied verbatim including indentation.
- Output multiple blocks in one reply when there are multiple changes; do not bundle unrelated changes into one block.
- Do not output any other format of code edit. Do not output diffs.
- Do not output placeholder comments like "// ...rest unchanged". Use multiple SEARCH/REPLACE blocks instead.`;

export interface FixerOptions {
  /** Directory containing src/ + tests/ + vitest.config.* */
  cwd: string;
  /** LLM used to propose fixes. */
  llm: LLM;
  /** Max retries after the first attempt. Default 1 (matching aider's design). */
  maxRetries?: number;
  /** Optional logger for progress. */
  log?: (message: string) => void;
}

export interface FixerResult {
  /** `true` if all tests pass at the end. */
  success: boolean;
  /** Number of model calls made (1 = first attempt only, 2 = first attempt + 1 retry). */
  modelCalls: number;
  /** Final vitest stdout + stderr, useful for debugging. */
  finalTestOutput: string;
  /** Edits that didn't apply on the last attempt. */
  lastFailures: ApplyResult[];
}

export async function runFixer(options: FixerOptions): Promise<FixerResult> {
  const { cwd, llm, maxRetries = 1, log = () => {} } = options;

  let modelCalls = 0;
  let testOutput = runVitest(cwd);

  if (testOutput.passed) {
    log("[fixer] tests already pass, nothing to do");
    return {
      success: true,
      modelCalls,
      finalTestOutput: testOutput.output,
      lastFailures: [],
    };
  }

  let lastFailures: ApplyResult[] = [];

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    log(`[fixer] attempt ${attempt + 1}/${maxRetries + 1} — tests failing, asking model for a fix`);

    const prompt = await buildPrompt({
      cwd,
      testOutput: testOutput.output,
      previousFailures: lastFailures,
    });

    const llmText = await llm.complete(`${SYSTEM_PROMPT}\n\n${prompt}`);
    modelCalls++;

    const fileReader = async (path: string) => {
      try {
        return await readFile(join(cwd, path), "utf8");
      } catch {
        return null;
      }
    };

    const results = await applyEdits(llmText, fileReader);
    lastFailures = results.filter((r) => !r.ok);

    for (const r of results) {
      if (r.ok) {
        await writeFile(join(cwd, r.path), r.after);
        log(`[fixer]   ✓ applied edit to ${r.path}`);
      } else {
        log(`[fixer]   ✗ ${r.path}: ${r.reason} — ${r.message}`);
      }
    }

    testOutput = runVitest(cwd);
    if (testOutput.passed) {
      log(`[fixer] ✓ tests pass after ${modelCalls} model call(s)`);
      return {
        success: true,
        modelCalls,
        finalTestOutput: testOutput.output,
        lastFailures,
      };
    }
  }

  log(`[fixer] tests still failing after ${maxRetries + 1} attempts — giving up`);
  return {
    success: false,
    modelCalls,
    finalTestOutput: testOutput.output,
    lastFailures,
  };
}

interface VitestResult {
  passed: boolean;
  output: string;
}

function runVitest(cwd: string): VitestResult {
  const result = spawnSync("bunx", ["vitest", "run", "--reporter=verbose"], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  return {
    passed: result.status === 0,
    output,
  };
}

async function buildPrompt(opts: {
  cwd: string;
  testOutput: string;
  previousFailures: ApplyResult[];
}): Promise<string> {
  const sourceFiles = await listSourceFiles(opts.cwd);
  const fileBlocks = await Promise.all(
    sourceFiles.map(async (path) => {
      const contents = await readFile(join(opts.cwd, path), "utf8");
      return `### ${path}\n\`\`\`ts\n${contents}\n\`\`\``;
    }),
  );

  let prompt = "";
  if (opts.previousFailures.length > 0) {
    prompt += "Your previous edit failed to apply:\n";
    for (const f of opts.previousFailures) {
      if (!f.ok) prompt += `- ${f.path}: ${f.reason} — ${f.message}\n`;
    }
    prompt += "\n";
  }

  prompt += `The test suite is failing. Here is the full vitest output:\n\n\`\`\`\n${opts.testOutput}\n\`\`\`\n\nHere are the source files you can edit:\n\n${fileBlocks.join("\n\n")}\n\nProduce SEARCH/REPLACE blocks that make every test pass. Do not modify the tests themselves.`;

  return prompt;
}

async function listSourceFiles(cwd: string): Promise<string[]> {
  // Hard-coded to keep the example small. A real fixer would walk src/ and skip
  // node_modules, dist, etc.
  return ["target/src/parseDuration.ts"];
}
