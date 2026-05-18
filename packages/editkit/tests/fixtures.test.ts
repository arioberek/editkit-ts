/**
 * Adversarial fixtures — the kind of malformed/weird LLM output we want the parser to
 * survive without crashing or silently doing the wrong thing. Each case derives from a
 * real-world failure mode observed in aider's issues / r/LocalLLaMA threads / Cursor logs.
 */
import { describe, expect, it } from "bun:test";
import { applyEditsSync, parseEdits } from "../src/index.ts";

describe("adversarial fixtures", () => {
  it("rejects a SEARCH block with no path anywhere", () => {
    const input = `<<<<<<< SEARCH
foo
=======
bar
>>>>>>> REPLACE`;
    expect(() => parseEdits(input)).toThrow(/no associated path/i);
  });

  it("ignores a fenced ```diff wrapper around the SEARCH block", () => {
    const input = `\`\`\`diff
src/util.ts
<<<<<<< SEARCH
old
=======
new
>>>>>>> REPLACE
\`\`\``;
    const edits = parseEdits(input);
    expect(edits[0]?.path).toBe("src/util.ts");
  });

  it("doesn't pick a fenced code block as a whole-file edit when SEARCH/REPLACE is present", () => {
    const input = `Here's some context:

\`\`\`ts
const foo = 1; // not an edit, just discussion
\`\`\`

src/util.ts
<<<<<<< SEARCH
old
=======
new
>>>>>>> REPLACE`;
    const edits = parseEdits(input);
    expect(edits).toHaveLength(1);
    expect(edits[0]?.format).toBe("search-replace");
  });

  it("survives an unclosed SEARCH block (returns nothing rather than throwing)", () => {
    const input = `f.ts
<<<<<<< SEARCH
unclosed
content
that
goes
forever`;
    expect(parseEdits(input, { formats: ["search-replace"] })).toEqual([]);
  });

  it("returns a structured failure for a unified-diff that targets a missing file with allowCreate=false", () => {
    const input = `--- a/missing.ts
+++ b/missing.ts
@@ -1 +1 @@
-x
+y
`;
    const out = applyEditsSync(input, {}, { allowCreate: false });
    expect(out[0]?.ok).toBe(false);
    if (!out[0]?.ok) expect(out[0]?.reason).toBe("missing-original");
  });

  it("preserves CRLF line endings in the output when the original used CRLF", () => {
    const original = "alpha\r\nbeta\r\ngamma\r\n";
    const input = `--- a/f.ts
+++ b/f.ts
@@ -1,3 +1,3 @@
 alpha
-beta
+BETA
 gamma
`;
    const out = applyEditsSync(input, { "f.ts": original });
    expect(out[0]?.ok).toBe(true);
    if (out[0]?.ok) expect(out[0].after).toBe("alpha\r\nBETA\r\ngamma\r\n");
  });

  it("handles a SEARCH block containing fenced ``` characters in the body", () => {
    const input = `f.md
<<<<<<< SEARCH
\`\`\`ts
old
\`\`\`
=======
\`\`\`ts
new
\`\`\`
>>>>>>> REPLACE`;
    const original = "before\n```ts\nold\n```\nafter\n";
    const out = applyEditsSync(input, { "f.md": original });
    expect(out[0]?.ok).toBe(true);
    if (out[0]?.ok) expect(out[0].after).toBe("before\n```ts\nnew\n```\nafter\n");
  });

  it("applies five sequential edits to the same file in source order", () => {
    const make = (i: number) => `f.ts\n<<<<<<< SEARCH\n${i}\n=======\n${i + 1}\n>>>>>>> REPLACE\n`;
    const input = [0, 1, 2, 3, 4].map(make).join("\n");
    const out = applyEditsSync(input, { "f.ts": "0\n" });
    expect(out.every((r) => r.ok)).toBe(true);
    const last = out[out.length - 1];
    if (last?.ok) expect(last.after).toBe("5\n");
  });
});
