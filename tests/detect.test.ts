import { describe, expect, it } from "bun:test";
import { detectFormats, parseEdits } from "../src/index.ts";

describe("detectFormats", () => {
  it("detects search-replace", () => {
    const input = `f.ts
<<<<<<< SEARCH
a
=======
b
>>>>>>> REPLACE`;
    expect(detectFormats(input)).toContain("search-replace");
  });

  it("detects unified-diff", () => {
    const input = `--- a/f.ts
+++ b/f.ts
@@ -1 +1 @@
-a
+b
`;
    expect(detectFormats(input)).toContain("unified-diff");
  });

  it("detects whole-file when nothing else matches", () => {
    const input = `f.ts
\`\`\`ts
const x = 1;
\`\`\``;
    expect(detectFormats(input)).toEqual(["whole-file"]);
  });

  it("returns empty for plain text", () => {
    expect(detectFormats("Just a chat reply, no edits.")).toEqual([]);
  });
});

describe("parseEdits — mixed input", () => {
  it("returns a search-replace and a unified-diff edit, in source order", () => {
    const input = `First, a unified diff:

--- a/a.ts
+++ b/a.ts
@@ -1 +1 @@
-1
+2

Now a search-replace:

b.ts
<<<<<<< SEARCH
foo
=======
bar
>>>>>>> REPLACE`;
    const edits = parseEdits(input);
    expect(edits.map((e) => e.format)).toEqual(["unified-diff", "search-replace"]);
  });
});
