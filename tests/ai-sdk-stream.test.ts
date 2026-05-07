import { describe, expect, it } from "bun:test";
import { streamEdits } from "../src/ai-sdk.ts";

async function* chunked(input: string, chunkSize: number): AsyncIterable<string> {
  for (let i = 0; i < input.length; i += chunkSize) {
    yield input.slice(i, i + chunkSize);
  }
}

describe("streamEdits", () => {
  it("yields each search-replace edit as its REPLACE fence arrives", async () => {
    const input = `Edits:

a.ts
<<<<<<< SEARCH
1
=======
2
>>>>>>> REPLACE

b.ts
<<<<<<< SEARCH
3
=======
4
>>>>>>> REPLACE`;
    const collected: string[] = [];
    for await (const { edit } of streamEdits(chunked(input, 8), {
      "a.ts": "1\n",
      "b.ts": "3\n",
    })) {
      collected.push(edit.path);
    }
    expect(collected).toEqual(["a.ts", "b.ts"]);
  });

  it("yields the same results regardless of chunk size", async () => {
    const input = `f.ts
<<<<<<< SEARCH
foo
=======
bar
>>>>>>> REPLACE`;
    const sizes = [1, 3, 17, 1024];
    for (const size of sizes) {
      const out: string[] = [];
      for await (const { result } of streamEdits(chunked(input, size), { "f.ts": "foo\n" })) {
        if (result.ok) out.push(result.after);
      }
      expect(out).toEqual(["bar\n"]);
    }
  });

  it("handles a whole-file edit that arrives in tiny chunks", async () => {
    const input = `new.ts
\`\`\`ts
export const x = 1;
\`\`\`
`;
    const out: { path: string; after?: string }[] = [];
    for await (const { edit, result } of streamEdits(chunked(input, 5), {})) {
      out.push({ path: edit.path, after: result.ok ? result.after : undefined });
    }
    expect(out).toHaveLength(1);
    expect(out[0]?.path).toBe("new.ts");
    expect(out[0]?.after).toBe("export const x = 1;\n");
  });
});
