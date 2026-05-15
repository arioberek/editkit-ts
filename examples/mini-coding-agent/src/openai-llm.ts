/**
 * Live-mode LLM that wraps the Vercel AI SDK + @ai-sdk/openai.
 *
 * The runtime `import(...)` calls are dynamic so the offline `bun run demo` does not need
 * to resolve the AI SDK at all. Because `ai` and `@ai-sdk/openai` are devDependencies of
 * this example, `await import(...)` returns the package's real types, so an API shape
 * change in either package surfaces as a `tsc` error rather than a runtime failure.
 *
 *   EDITKIT_DEMO_MODE=live OPENAI_API_KEY=sk-... bun run demo:live
 */

import type { LLM } from "./agent.ts";

export interface OpenAILLMOptions {
  model?: string;
}

async function importOrThrow<T>(load: () => Promise<T>, pkg: string): Promise<T> {
  try {
    return await load();
  } catch (err) {
    throw new Error(
      `The live OpenAI mode requires the \`${pkg}\` package. Install it with \`bun add ai @ai-sdk/openai\` and try again. Underlying error: ${(err as Error).message}`,
    );
  }
}

export async function createOpenAILLM(options: OpenAILLMOptions = {}): Promise<LLM> {
  const modelName = options.model ?? "gpt-4o-mini";

  // Dynamic imports so this file does not crash at parse time when the AI SDK is absent.
  // `await import(...)` is typed against the real packages (they're devDependencies), so
  // a breaking change in `streamText` or `openai` shows up here as a tsc error.
  const { openai } = await importOrThrow(() => import("@ai-sdk/openai"), "@ai-sdk/openai");
  const { streamText } = await importOrThrow(() => import("ai"), "ai");

  return {
    stream(prompt) {
      const { textStream } = streamText({
        model: openai(modelName),
        system: prompt.system,
        prompt: prompt.user,
      });
      return textStream;
    },
  };
}
