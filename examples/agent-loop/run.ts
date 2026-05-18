/**
 * Test-fix agent loop demo.
 *
 * Reproduces aider's canonical workflow with a deterministic mock LLM so it runs without
 * any API key:
 *
 *   1. A unit test fails.
 *   2. The "model" emits a SEARCH/REPLACE block to fix the bug.
 *   3. editkit applies the edit to a real on-disk file.
 *   4. The test re-runs. If the fix didn't take, we feed editkit's structured failure
 *      back into the model and try once more.
 *
 * Run: bun run examples/agent-loop/run.ts
 *
 * Swap `mockModel` for a real `generateText` call to do this with gpt-4o or claude.
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyEdits } from "editkit";
import type { ApplyResult } from "editkit";

const BUGGY_SOURCE = `export function add(a: number, b: number) {
  return a - b;
}
`;

// Deterministic stand-in for an LLM. First call gets the wrong SEARCH (a hallucination
// the real model might emit), second call sees the parser's error and corrects.
const responses = [
  // Wrong: the model invented a function name that isn't in the file
  `Looking at this, I think the bug is in subtract:

src/math.ts
<<<<<<< SEARCH
function subtract(a: number, b: number) {
  return a + b;
}
=======
function subtract(a: number, b: number) {
  return a - b;
}
>>>>>>> REPLACE`,

  // Right: after seeing the parse error, the model re-reads the file and emits the real fix
  `Right, the actual function is \`add\`. Here's the correct fix:

src/math.ts
<<<<<<< SEARCH
  return a - b;
=======
  return a + b;
>>>>>>> REPLACE`,
];
let callIdx = 0;

async function mockModel(_prompt: string): Promise<string> {
  const r = responses[callIdx++];
  if (!r) throw new Error("mockModel ran out of canned responses");
  return r;
}

function check(after: string): { ok: true } | { ok: false; reason: string } {
  // Standin for "running the test suite". add(2, 3) must equal 5.
  const m = after.match(/return\s+a\s*([+\-*/])\s*b/);
  if (m && m[1] === "+") return { ok: true };
  return { ok: false, reason: `expected add(2,3)===5 but math.ts uses '${m?.[1] ?? "?"}'` };
}

async function attempt(prompt: string, dir: string): Promise<ApplyResult[]> {
  const text = await mockModel(prompt);
  const results = await applyEdits(text, async (p) => {
    try {
      return await readFile(join(dir, p), "utf8");
    } catch {
      return null;
    }
  });
  for (const r of results) {
    if (r.ok) await writeFile(join(dir, r.path), r.after);
  }
  return results;
}

async function main() {
  const dir = await mkdtemp(join(tmpdir(), "editkit-agent-loop-"));
  try {
    await mkdir(join(dir, "src"), { recursive: true });
    await writeFile(join(dir, "src/math.ts"), BUGGY_SOURCE);

    console.log(`[agent] working in ${dir}`);
    console.log(`[agent] initial source uses 'a - b' (bug)`);

    const testOutput = "FAIL: add(2, 3) returned -1, expected 5";
    let results = await attempt(`Fix the failing test:\n${testOutput}`, dir);

    let failures = results.filter((r) => !r.ok);
    if (failures.length > 0) {
      const errMsg = failures
        .map((f) => (f.ok ? "" : `${f.path}: ${f.message}`))
        .filter(Boolean)
        .join("\n");
      console.log(`[agent] attempt 1 failed:\n  ${errMsg.split("\n").join("\n  ")}`);
      console.log(`[agent] retrying with the parser's error fed back...`);
      results = await attempt(`Your previous edit failed:\n${errMsg}\nTry again.`, dir);
      failures = results.filter((r) => !r.ok);
    }

    if (failures.length > 0) {
      console.error("[agent] still failing after retry; giving up");
      process.exitCode = 1;
      return;
    }

    const after = await readFile(join(dir, "src/math.ts"), "utf8");
    const check_ = check(after);
    if (!check_.ok) {
      console.error(`[agent] applied an edit but the test still fails: ${check_.reason}`);
      process.exitCode = 1;
      return;
    }

    console.log(`[agent] ✓ test passes after ${callIdx} model call(s)`);
    console.log(`[agent] final source:\n${after.replace(/^/gm, "    ")}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
