import { describe, expect, it } from "bun:test";
import { applyEditsSync, parseWholeFile } from "../src/index.ts";

describe("parseWholeFile", () => {
  it("parses a path + fenced block", () => {
    const input = `Here's the new file:

src/Greeting.tsx
\`\`\`tsx
export const Greeting = () => <h1>hi</h1>;
\`\`\`

Done.`;
    const edits = parseWholeFile(input);
    expect(edits).toHaveLength(1);
    expect(edits[0]?.path).toBe("src/Greeting.tsx");
    expect(edits[0]?.contents).toBe("export const Greeting = () => <h1>hi</h1>;");
  });

  it("supports tilde fences", () => {
    const input = `f.md
~~~markdown
# Hello
~~~`;
    const edits = parseWholeFile(input);
    expect(edits[0]?.contents).toBe("# Hello");
  });

  it("does not match a fenced block without a path line", () => {
    const input = `Here's a code sample:

\`\`\`ts
const x = 1;
\`\`\``;
    expect(parseWholeFile(input)).toEqual([]);
  });
});

describe("applyEdits — whole-file", () => {
  it("creates a new file from a whole-file edit", () => {
    const input = `new.ts
\`\`\`ts
export const x = 1;
\`\`\``;
    const out = applyEditsSync(input, {});
    expect(out[0]?.ok).toBe(true);
    if (out[0]?.ok) expect(out[0].after).toBe("export const x = 1;\n");
  });

  it("overwrites an existing file", () => {
    const input = `f.ts
\`\`\`ts
new content
\`\`\``;
    const out = applyEditsSync(input, { "f.ts": "old content\n" });
    expect(out[0]?.ok).toBe(true);
    if (out[0]?.ok) expect(out[0].after).toBe("new content\n");
  });
});
