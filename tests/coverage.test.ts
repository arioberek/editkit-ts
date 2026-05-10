/**
 * Edge-case coverage. Each block targets a code path that the format-specific test files
 * don't exercise: fuzzyReplace strategy disables, path-detection rejection rules, hunk
 * boundary cases, line-ending preservation, allowCreate=false on every format, and the
 * detectFormats heuristics.
 */
import { describe, expect, it } from "bun:test";
import {
  EditkitError,
  applyEditsSync,
  detectFormats,
  fuzzyReplace,
  parseEdits,
  parseSearchReplace,
  parseUnifiedDiff,
  parseWholeFile,
} from "../src/index.ts";

describe("fuzzyReplace strategy disables", () => {
  it("returns 'not-found' when fuzzyWhitespace is disabled and exact fails", () => {
    // Multi-line so exact-substring really doesn't match: original has 8-space inner indent,
    // search has 4-space. Exact fails; with fuzzy off, no indent-shift fallback.
    const original = "function f() {\n    if (x) {\n        do();\n    }\n}\n";
    const search = "if (x) {\n    do();\n}";
    const replace = "if (y) {\n    redo();\n}";
    const r = fuzzyReplace(original, search, replace, { fuzzyWhitespace: false });
    expect(r.kind).toBe("not-found");
  });

  it("falls back to indent-shift when fuzzy is enabled (the same input)", () => {
    const original = "function f() {\n    if (x) {\n        do();\n    }\n}\n";
    const search = "if (x) {\n    do();\n}";
    const replace = "if (y) {\n    redo();\n}";
    const r = fuzzyReplace(original, search, replace);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      expect(r.strategy).toBe("indent-shift");
      expect(r.text).toContain("    if (y) {");
      expect(r.text).toContain("        redo();");
    }
  });

  it("reports 'ambiguous' when indent-shift matches multiple sites", () => {
    const original = `function a() {
    if (x) {
        do();
    }
}
function b() {
    if (x) {
        do();
    }
}
`;
    const r = fuzzyReplace(original, "if (x) {\n    do();\n}", "if (x) {\n    redo();\n}");
    expect(r.kind).toBe("ambiguous");
  });

  it("re-indents the REPLACE to match the matched indent", () => {
    const original = "function f() {\n    nested();\n}\n";
    const r = fuzzyReplace(original, "nested();", "newCall();");
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") expect(r.text).toContain("    newCall();");
  });

  it("reports exact-match ambiguity even when fuzzy is enabled", () => {
    const r = fuzzyReplace("x\nx\n", "x", "y");
    expect(r.kind).toBe("ambiguous");
  });
});

describe("parseSearchReplace path detection", () => {
  it("rejects a 'path' that contains spaces", () => {
    const input = `some sentence with words
<<<<<<< SEARCH
x
=======
y
>>>>>>> REPLACE`;
    expect(() => parseSearchReplace(input)).toThrow(/no associated path/i);
  });

  it("rejects a 'path' that starts with a comment marker", () => {
    const input = `// not a path
<<<<<<< SEARCH
x
=======
y
>>>>>>> REPLACE`;
    expect(() => parseSearchReplace(input)).toThrow();
  });

  it("accepts a path with no extension if it contains a slash", () => {
    const input = `bin/run
<<<<<<< SEARCH
old
=======
new
>>>>>>> REPLACE`;
    const edits = parseSearchReplace(input);
    expect(edits[0]?.path).toBe("bin/run");
  });

  it("walks past a fence opener line to find the path above", () => {
    const input = `\`\`\`diff
src/file.ts
<<<<<<< SEARCH
x
=======
y
>>>>>>> REPLACE
\`\`\``;
    const edits = parseSearchReplace(input);
    expect(edits[0]?.path).toBe("src/file.ts");
  });
});

describe("applySearchReplace edge cases", () => {
  it("empty REPLACE deletes the matched range", () => {
    const input = `f.ts
<<<<<<< SEARCH
delete me
=======
>>>>>>> REPLACE`;
    const out = applyEditsSync(input, { "f.ts": "keep\ndelete me\nkeep\n" });
    expect(out[0]?.ok).toBe(true);
    if (out[0]?.ok) expect(out[0].after).toBe("keep\nkeep\n");
  });

  it("empty SEARCH on an existing non-empty file fails as ambiguous-match", () => {
    const input = `f.ts
<<<<<<< SEARCH
=======
new
>>>>>>> REPLACE`;
    const out = applyEditsSync(input, { "f.ts": "existing\n" });
    expect(out[0]?.ok).toBe(false);
    if (!out[0]?.ok) expect(out[0]?.reason).toBe("ambiguous-match");
  });

  it("respects allowCreate=false on a create attempt", () => {
    const input = `f.ts
<<<<<<< SEARCH
=======
new
>>>>>>> REPLACE`;
    const out = applyEditsSync(input, {}, { allowCreate: false });
    expect(out[0]?.ok).toBe(false);
    if (!out[0]?.ok) expect(out[0]?.reason).toBe("missing-original");
  });

  it("respects allowCreate=false when SEARCH is non-empty but file is missing", () => {
    const input = `missing.ts
<<<<<<< SEARCH
old
=======
new
>>>>>>> REPLACE`;
    const out = applyEditsSync(input, {}, { allowCreate: false });
    expect(out[0]?.ok).toBe(false);
    if (!out[0]?.ok) expect(out[0]?.reason).toBe("missing-original");
  });
});

describe("parseUnifiedDiff edge cases", () => {
  it("captures a rename when --- and +++ paths differ", () => {
    const input = `--- a/old.ts
+++ b/new.ts
@@ -1 +1 @@
-x
+y
`;
    const edits = parseUnifiedDiff(input);
    expect(edits[0]?.path).toBe("new.ts");
    expect(edits[0]?.oldPath).toBe("old.ts");
  });

  it("tolerates a '\\ No newline at end of file' marker in the body", () => {
    const input = `--- a/f.ts
+++ b/f.ts
@@ -1 +1 @@
-x
\\ No newline at end of file
+y
`;
    const edits = parseUnifiedDiff(input);
    const lines = edits[0]?.hunks[0]?.lines ?? [];
    expect(lines).toContain("\\ No newline at end of file");
  });

  it("parses multiple hunks within a single file", () => {
    const input = `--- a/f.ts
+++ b/f.ts
@@ -1 +1 @@
-1
+one
@@ -5 +5 @@
-5
+five
`;
    const edits = parseUnifiedDiff(input);
    expect(edits[0]?.hunks).toHaveLength(2);
  });
});

describe("applyUnifiedDiff edge cases", () => {
  it("applies multiple hunks per file in source order", () => {
    const original = "1\n2\n3\n4\n5\n";
    const input = `--- a/f.ts
+++ b/f.ts
@@ -1 +1 @@
-1
+ONE
@@ -5 +5 @@
-5
+FIVE
`;
    const out = applyEditsSync(input, { "f.ts": original });
    expect(out[0]?.ok).toBe(true);
    if (out[0]?.ok) expect(out[0].after).toBe("ONE\n2\n3\n4\nFIVE\n");
  });

  it("preserves CRLF line endings when applying a unified diff", () => {
    const original = "a\r\nb\r\nc\r\n";
    const input = `--- a/f.ts
+++ b/f.ts
@@ -1,3 +1,3 @@
 a
-b
+B
 c
`;
    const out = applyEditsSync(input, { "f.ts": original });
    expect(out[0]?.ok).toBe(true);
    if (out[0]?.ok) expect(out[0].after).toBe("a\r\nB\r\nc\r\n");
  });

  it("respects allowCreate=false for /dev/null source", () => {
    const input = `--- /dev/null
+++ b/new.ts
@@ -0,0 +1,1 @@
+hello
`;
    const out = applyEditsSync(input, {}, { allowCreate: false });
    expect(out[0]?.ok).toBe(false);
    if (!out[0]?.ok) expect(out[0]?.reason).toBe("missing-original");
  });
});

describe("parseWholeFile edge cases", () => {
  it("captures multiple file blocks in one input", () => {
    const input = `a.ts
\`\`\`ts
const a = 1;
\`\`\`

b.ts
\`\`\`ts
const b = 2;
\`\`\``;
    const edits = parseWholeFile(input);
    expect(edits.map((e) => e.path)).toEqual(["a.ts", "b.ts"]);
  });

  it("respects allowCreate=false for new files", () => {
    const input = `new.ts
\`\`\`ts
const x = 1;
\`\`\``;
    const out = applyEditsSync(input, {}, { allowCreate: false, formats: ["whole-file"] });
    expect(out[0]?.ok).toBe(false);
    if (!out[0]?.ok) expect(out[0]?.reason).toBe("missing-original");
  });

  it("ensures the output ends with a trailing newline", () => {
    const input = `f.ts
\`\`\`ts
no trailing newline
\`\`\``;
    const out = applyEditsSync(input, {}, { formats: ["whole-file"] });
    expect(out[0]?.ok).toBe(true);
    if (out[0]?.ok) expect(out[0].after.endsWith("\n")).toBe(true);
  });
});

describe("detectFormats heuristics", () => {
  it("returns multiple formats when both SEARCH/REPLACE and unified-diff appear", () => {
    const input = `--- a/x.ts
+++ b/x.ts
@@ -1 +1 @@
-1
+2

f.ts
<<<<<<< SEARCH
a
=======
b
>>>>>>> REPLACE`;
    const formats = detectFormats(input);
    expect(formats).toContain("search-replace");
    expect(formats).toContain("unified-diff");
  });

  it("does not return whole-file when SEARCH/REPLACE is also present", () => {
    const input = `f.ts
\`\`\`ts
const x = 1;
\`\`\`

g.ts
<<<<<<< SEARCH
a
=======
b
>>>>>>> REPLACE`;
    expect(detectFormats(input)).not.toContain("whole-file");
  });

  it("returns whole-file only when the path-then-fence shape appears", () => {
    expect(detectFormats("Just chat with no edits at all.")).toEqual([]);
  });
});

describe("EditkitError", () => {
  it("constructs with code and name", () => {
    const e = new EditkitError("oops", "PARSE_ERROR");
    expect(e.message).toBe("oops");
    expect(e.code).toBe("PARSE_ERROR");
    expect(e.name).toBe("EditkitError");
    expect(e instanceof Error).toBe(true);
  });
});

describe("parseEdits source ordering across formats", () => {
  it("returns edits sorted by source position regardless of format", () => {
    const input = `b.ts
<<<<<<< SEARCH
b
=======
B
>>>>>>> REPLACE

--- a/a.ts
+++ b/a.ts
@@ -1 +1 @@
-1
+2
`;
    const edits = parseEdits(input);
    expect(edits.map((e) => e.path)).toEqual(["b.ts", "a.ts"]);
  });
});
