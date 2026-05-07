/**
 * Run with: OPENAI_API_KEY=sk-... bun run example.ts
 *
 * Streams a refactor for examples/ai-sdk-v5/sample.ts and applies the edits as they arrive.
 */
import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { streamEdits } from "editkit/ai-sdk";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SAMPLE = join(__dirname, "sample.ts");

const SYSTEM_PROMPT = `When you propose a code change, output it as one or more SEARCH/REPLACE blocks:

PATH/TO/FILE
<<<<<<< SEARCH
...exact lines from the existing file...
=======
...what they should be replaced with...
>>>>>>> REPLACE

The SEARCH section must be unique within the file (extend it with surrounding context if needed).`;

async function main() {
  const sample = await readFile(SAMPLE, "utf8");

  const { textStream } = await streamText({
    model: openai("gpt-4o"),
    system: SYSTEM_PROMPT,
    prompt: `Refactor this file so add and subtract are methods on a Calculator class:

${SAMPLE}
\`\`\`ts
${sample}
\`\`\``,
  });

  for await (const { edit, result } of streamEdits(
    textStream,
    async (path) => readFile(path, "utf8"),
  )) {
    if (result.ok) {
      await writeFile(result.path, result.after);
      console.log(`✓ ${edit.format} → ${result.path}`);
    } else {
      console.warn(`✗ ${result.path}: ${result.message}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
