/**
 * Orchestration tests. The library is meant to be the engine inside an agent loop, so
 * these tests cover the patterns an orchestrator actually exercises: async file readers,
 * mixed-format input, format restriction, retry-after-failure, overlay across consecutive
 * edits, and streaming under failure conditions.
 */
import { describe, expect, it } from "bun:test";
import { streamEdits } from "../src/ai-sdk.ts";
import { applyEdits } from "../src/index.ts";

async function* chunked(s: string, n: number): AsyncIterable<string> {
  for (let i = 0; i < s.length; i += n) yield s.slice(i, i + n);
}

describe("retry-with-error-feedback", () => {
  it("recovers when the model corrects its SEARCH on the second try", async () => {
    const file = "x = 1\n";
    const wrong = `f.ts
<<<<<<< SEARCH
y = 1
=======
y = 2
>>>>>>> REPLACE`;
    const right = `f.ts
<<<<<<< SEARCH
x = 1
=======
x = 2
>>>>>>> REPLACE`;

    const first = await applyEdits(wrong, { "f.ts": file });
    expect(first[0]?.ok).toBe(false);
    const f0 = first[0];
    if (f0 && !f0.ok) {
      expect(f0.message).toMatch(/SEARCH/i);
      expect(f0.reason).toBe("search-not-found");
    }

    const second = await applyEdits(right, { "f.ts": file });
    expect(second[0]?.ok).toBe(true);
    if (second[0]?.ok) expect(second[0].after).toBe("x = 2\n");
  });

  it("collects per-file errors so a retry prompt can name only the failed paths", async () => {
    const llmResponse = `a.ts
<<<<<<< SEARCH
nope
=======
new
>>>>>>> REPLACE

b.ts
<<<<<<< SEARCH
b
=======
B
>>>>>>> REPLACE

c.ts
<<<<<<< SEARCH
gone
=======
new
>>>>>>> REPLACE`;
    const results = await applyEdits(llmResponse, {
      "a.ts": "actual\n",
      "b.ts": "b\n",
      "c.ts": "actual\n",
    });
    const failed = results.filter((r) => !r.ok).map((r) => r.path);
    expect(failed).toEqual(["a.ts", "c.ts"]);
  });
});

describe("async FileReader", () => {
  it("only reads paths the LLM mentions", async () => {
    const seen: string[] = [];
    const reader = async (p: string) => {
      seen.push(p);
      if (p === "src/a.ts") return "alpha\n";
      throw new Error("not found");
    };
    const llmResponse = `src/a.ts
<<<<<<< SEARCH
alpha
=======
beta
>>>>>>> REPLACE`;
    const out = await applyEdits(llmResponse, reader);
    expect(seen).toEqual(["src/a.ts"]);
    expect(out[0]?.ok).toBe(true);
  });

  it("treats a throwing reader as 'file not found' (creates if SEARCH is empty)", async () => {
    const reader = async () => {
      throw new Error("ENOENT");
    };
    const llmResponse = `new.ts
<<<<<<< SEARCH
=======
hello
>>>>>>> REPLACE`;
    const out = await applyEdits(llmResponse, reader);
    expect(out[0]?.ok).toBe(true);
  });

  it("respects allowCreate=false through async reader", async () => {
    const reader = async () => null;
    const llmResponse = `new.ts
<<<<<<< SEARCH
=======
hello
>>>>>>> REPLACE`;
    const out = await applyEdits(llmResponse, reader, { allowCreate: false });
    expect(out[0]?.ok).toBe(false);
    if (!out[0]?.ok) expect(out[0]?.reason).toBe("missing-original");
  });

  it("uses overlay so consecutive edits to the same file see each other", async () => {
    const reads: string[] = [];
    const reader = async (p: string) => {
      reads.push(p);
      return "0\n";
    };
    const llmResponse = `f.ts
<<<<<<< SEARCH
0
=======
1
>>>>>>> REPLACE

f.ts
<<<<<<< SEARCH
1
=======
2
>>>>>>> REPLACE`;
    const out = await applyEdits(llmResponse, reader);
    expect(out.every((r) => r.ok)).toBe(true);
    expect(reads).toEqual(["f.ts"]); // second edit reads from overlay, not the reader
    const last = out[out.length - 1];
    if (last?.ok) expect(last.after).toBe("2\n");
  });
});

describe("mixed-format input", () => {
  it("applies a unified diff and a search-replace block in source order", async () => {
    const llmResponse = `--- a/x.ts
+++ b/x.ts
@@ -1 +1 @@
-x = 1
+x = 2

y.ts
<<<<<<< SEARCH
y = 3
=======
y = 4
>>>>>>> REPLACE`;
    const out = await applyEdits(llmResponse, {
      "x.ts": "x = 1\n",
      "y.ts": "y = 3\n",
    });
    expect(out.map((r) => r.path)).toEqual(["x.ts", "y.ts"]);
    expect(out.every((r) => r.ok)).toBe(true);
  });

  it("respects formats option to ignore unwanted formats", async () => {
    const llmResponse = `--- a/x.ts
+++ b/x.ts
@@ -1 +1 @@
-x = 1
+x = 2

y.ts
<<<<<<< SEARCH
y = 3
=======
y = 4
>>>>>>> REPLACE`;
    const out = await applyEdits(
      llmResponse,
      { "x.ts": "x = 1\n", "y.ts": "y = 3\n" },
      { formats: ["search-replace"] },
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.path).toBe("y.ts");
  });
});

describe("streamEdits under failure", () => {
  it("yields a failure result without aborting the rest of the stream", async () => {
    const input = `a.ts
<<<<<<< SEARCH
nothere
=======
new
>>>>>>> REPLACE

b.ts
<<<<<<< SEARCH
b
=======
B
>>>>>>> REPLACE`;
    const out: { path: string; ok: boolean }[] = [];
    for await (const { result } of streamEdits(chunked(input, 5), {
      "a.ts": "actual content\n",
      "b.ts": "b\n",
    })) {
      out.push({ path: result.path, ok: result.ok });
    }
    expect(out).toEqual([
      { path: "a.ts", ok: false },
      { path: "b.ts", ok: true },
    ]);
  });

  it("yields nothing when the stream contains only chat prose", async () => {
    const out: unknown[] = [];
    for await (const x of streamEdits(chunked("Just a chat reply with no edits.\n", 4), {})) {
      out.push(x);
    }
    expect(out).toEqual([]);
  });

  it("falls back to a flush-pass for trailing edits without a clear boundary", async () => {
    // No trailing prose / blank line — the flush logic at end-of-stream should still emit.
    const input = `a.ts
<<<<<<< SEARCH
1
=======
2
>>>>>>> REPLACE`;
    const out: string[] = [];
    for await (const { result } of streamEdits(chunked(input, 12), { "a.ts": "1\n" })) {
      if (result.ok) out.push(result.after);
    }
    expect(out).toEqual(["2\n"]);
  });
});
