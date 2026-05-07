import { describe, expect, it } from "bun:test";
import { applyEditsSync, parseUnifiedDiff } from "../src/index.ts";

describe("parseUnifiedDiff", () => {
  it("parses a basic single-file diff", () => {
    const input = `--- a/f.ts
+++ b/f.ts
@@ -1,3 +1,3 @@
 a
-b
+B
 c
`;
    const edits = parseUnifiedDiff(input);
    expect(edits).toHaveLength(1);
    expect(edits[0]?.path).toBe("f.ts");
    expect(edits[0]?.hunks).toHaveLength(1);
    expect(edits[0]?.hunks[0]?.lines).toEqual([" a", "-b", "+B", " c"]);
  });

  it("parses multiple files in a single input", () => {
    const input = `--- a/x.ts
+++ b/x.ts
@@ -1 +1 @@
-1
+2
--- a/y.ts
+++ b/y.ts
@@ -1 +1 @@
-3
+4
`;
    const edits = parseUnifiedDiff(input);
    expect(edits.map((e) => e.path)).toEqual(["x.ts", "y.ts"]);
  });
});

describe("applyEdits — unified-diff", () => {
  it("applies a context-anchored hunk to existing content", () => {
    const original = "alpha\nbeta\ngamma\n";
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
    if (out[0]?.ok) expect(out[0].after).toBe("alpha\nBETA\ngamma\n");
  });

  it("locates the hunk even when its line numbers drifted", () => {
    const original = "head1\nhead2\nhead3\nhead4\nalpha\nbeta\ngamma\ntail\n";
    // Diff says hunk starts at line 1 but it's actually at line 5.
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
    if (out[0]?.ok) expect(out[0].after).toBe("head1\nhead2\nhead3\nhead4\nalpha\nBETA\ngamma\ntail\n");
  });

  it("creates a new file when /dev/null is the source", () => {
    const input = `--- /dev/null
+++ b/new.ts
@@ -0,0 +1,2 @@
+line1
+line2
`;
    const out = applyEditsSync(input, {});
    expect(out[0]?.ok).toBe(true);
    if (out[0]?.ok) expect(out[0].after).toBe("line1\nline2\n");
  });

  it("reports hunk-context-mismatch when context is wrong", () => {
    const input = `--- a/f.ts
+++ b/f.ts
@@ -1,3 +1,3 @@
 totally
-different
+context
 here
`;
    const out = applyEditsSync(input, { "f.ts": "real\nfile\ncontent\n" });
    expect(out[0]?.ok).toBe(false);
    if (!out[0]?.ok) expect(out[0]?.reason).toBe("hunk-context-mismatch");
  });
});
