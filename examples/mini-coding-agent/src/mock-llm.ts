/**
 * A fake LLM backed by pre-recorded transcripts.
 *
 * `createMockLLM` accepts a sequence of fixture sources — each one is either a path to a
 * file in fixtures/ or an inline string — and returns an `LLM` that yields each transcript
 * one chunk at a time on successive `.stream(...)` calls. Chunks rotate through varying
 * sizes so the streaming code path is exercised the same way it is with a live model.
 */

import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { LLM } from "./agent.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES_ROOT = resolve(HERE, "..", "fixtures");

const CHUNK_SIZES = [8, 12, 24, 6, 18];

export interface MockLLMSource {
  /** Either a path under fixtures/ (e.g. "scenario-multifile/round-1.txt") or a raw string. */
  text?: string;
  path?: string;
}

export type MockLLMInput = Array<string | MockLLMSource>;

export function createMockLLM(sources: MockLLMInput): LLM {
  let cursor = 0;

  return {
    stream(_prompt: { system: string; user: string }): AsyncIterable<string> {
      const idx = cursor++;
      if (idx >= sources.length) {
        throw new Error(
          `mock-llm: agent requested response #${idx + 1} but only ${sources.length} fixture(s) were configured. Add another fixture or expect the agent to stop sooner.`,
        );
      }
      const source = sources[idx];
      return chunkAsync(loadSource(source));
    },
  };
}

async function loadSource(source: string | MockLLMSource | undefined): Promise<string> {
  if (source === undefined) throw new Error("mock-llm: undefined source");
  if (typeof source === "string") {
    if (source.includes("\n") || source.includes("<<<<<<<")) return source;
    return readFixture(source);
  }
  if (source.text !== undefined) return source.text;
  if (source.path !== undefined) return readFixture(source.path);
  throw new Error("mock-llm: source must specify either `text` or `path`");
}

async function readFixture(p: string): Promise<string> {
  const abs = isAbsolute(p) ? p : resolve(FIXTURES_ROOT, p);
  return readFile(abs, "utf8");
}

async function* chunkAsync(textPromise: Promise<string>): AsyncIterable<string> {
  const text = await textPromise;
  let i = 0;
  let sizeIdx = 0;
  while (i < text.length) {
    const size = CHUNK_SIZES[sizeIdx % CHUNK_SIZES.length] ?? 16;
    sizeIdx++;
    yield text.slice(i, i + size);
    i += size;
    // Yield to the event loop so the consumer can interleave work between chunks.
    await new Promise((r) => setTimeout(r, 0));
  }
}
