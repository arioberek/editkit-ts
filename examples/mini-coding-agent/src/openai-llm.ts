/**
 * Live-mode LLM that wraps the Vercel AI SDK + @ai-sdk/openai.
 *
 * The imports here are dynamic so the offline `bun run demo` works without those packages
 * installed. The example's package.json does NOT list `ai` or `@ai-sdk/openai` as direct
 * dependencies; install them yourself if you want to use this adapter:
 *
 *   bun add ai @ai-sdk/openai
 *
 * Then:
 *
 *   OPENAI_API_KEY=sk-... bun run demo:live
 */

import type { LLM } from "./agent.ts";

export interface OpenAILLMOptions {
  model?: string;
}

export async function createOpenAILLM(options: OpenAILLMOptions = {}): Promise<LLM> {
  const modelName = options.model ?? "gpt-4o-mini";

  // Dynamic imports so this file does not crash at parse time when the AI SDK is absent.
  const aiSdkOpenai = (await import("@ai-sdk/openai").catch((err) => {
    throw new Error(
      `The live OpenAI mode requires the \`@ai-sdk/openai\` package. Install it with \`bun add ai @ai-sdk/openai\` and try again. Underlying error: ${(err as Error).message}`,
    );
  })) as { openai: (id: string) => unknown };

  const ai = (await import("ai").catch((err) => {
    throw new Error(
      `The live OpenAI mode requires the \`ai\` package. Install it with \`bun add ai @ai-sdk/openai\` and try again. Underlying error: ${(err as Error).message}`,
    );
  })) as {
    streamText: (args: {
      model: unknown;
      system: string;
      prompt: string;
    }) => { textStream: AsyncIterable<string> };
  };

  return {
    stream(prompt) {
      const { textStream } = ai.streamText({
        model: aiSdkOpenai.openai(modelName),
        system: prompt.system,
        prompt: prompt.user,
      });
      return textStream;
    },
  };
}
