/**
 * LLM interface shared by the mock and the live AI SDK wrapper. Both expose a single
 * `complete()` method that takes a prompt and returns text. The fixer doesn't care which
 * one it gets.
 */
export interface LLM {
  complete(prompt: string): Promise<string>;
}

export interface MockResponse {
  /** Substring(s) that must appear in the prompt for this response to be picked. */
  matches?: string[];
  /** The text to return. */
  text: string;
}

/**
 * Deterministic LLM that returns canned text. The first response whose `matches` strings
 * all appear in the prompt is returned. If no response matches, throws — that's a fixture
 * gap.
 */
export function createMockLLM(responses: MockResponse[]): LLM {
  let calls = 0;
  return {
    async complete(prompt: string): Promise<string> {
      calls++;
      for (const r of responses) {
        const matchesAll = (r.matches ?? []).every((m) => prompt.includes(m));
        if (matchesAll) return r.text;
      }
      throw new Error(
        `mock LLM (call ${calls}): no canned response matched. Prompt starts: ${prompt.slice(0, 200)}...`,
      );
    },
  };
}

/**
 * Live LLM via the Vercel AI SDK. Dynamically imports `ai` and `@ai-sdk/openai` so the
 * offline demo works without those packages installed.
 */
export async function createLiveLLM(): Promise<LLM> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is required for live mode");

  const { generateText } = await import("ai");
  const { createOpenAI } = await import("@ai-sdk/openai");
  const openai = createOpenAI({ apiKey });

  return {
    async complete(prompt: string): Promise<string> {
      const { text } = await generateText({
        model: openai("gpt-4o-mini"),
        prompt,
      });
      return text;
    },
  };
}
