import { describe, expect, it } from "bun:test";
import { fuzzyReplace } from "../src/apply/fuzzy.ts";
import { applyEditsSync, parseSearchReplace } from "../src/index.ts";

describe("parseSearchReplace", () => {
  it("parses a single block with the path on the line above", () => {
    const input = `Sure, here's the change:

src/util.ts
<<<<<<< SEARCH
export const x = 1;
=======
export const x = 2;
>>>>>>> REPLACE

That should do it.`;

    const edits = parseSearchReplace(input);
    expect(edits).toHaveLength(1);
    expect(edits[0]?.path).toBe("src/util.ts");
    expect(edits[0]?.search).toBe("export const x = 1;\n");
    expect(edits[0]?.replace).toBe("export const x = 2;\n");
  });

  it("parses multiple blocks targeting different files", () => {
    const input = `a.ts
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
    const edits = parseSearchReplace(input);
    expect(edits.map((e) => e.path)).toEqual(["a.ts", "b.ts"]);
  });

  it("accepts inline path on the SEARCH fence (some models do this)", () => {
    const input = `<<<<<<< SEARCH src/inline.ts
old
=======
new
>>>>>>> REPLACE`;
    const edits = parseSearchReplace(input);
    expect(edits[0]?.path).toBe("src/inline.ts");
    expect(edits[0]?.search).toBe("old\n");
  });

  it("accepts the path as the first line *inside* the SEARCH block (aider quirk)", () => {
    const input = `<<<<<<< SEARCH
src/quirk.ts
old
=======
new
>>>>>>> REPLACE`;
    const edits = parseSearchReplace(input);
    expect(edits[0]?.path).toBe("src/quirk.ts");
    expect(edits[0]?.search).toBe("old\n");
  });

  it("tolerates 7+ fence characters (some models drift)", () => {
    const input = `f.ts
<<<<<<<<<<<< SEARCH
old
=========
new
>>>>>>>>>>>> REPLACE`;
    const edits = parseSearchReplace(input);
    expect(edits).toHaveLength(1);
    expect(edits[0]?.search).toBe("old\n");
  });

  it("ignores stray text between blocks", () => {
    const input = `a.ts
<<<<<<< SEARCH
foo
=======
bar
>>>>>>> REPLACE

Some commentary about why we made that change. Note the use of bar.

a.ts
<<<<<<< SEARCH
zip
=======
zap
>>>>>>> REPLACE`;
    expect(parseSearchReplace(input)).toHaveLength(2);
  });
});

describe("applyEdits — search-replace", () => {
  it("applies an exact match", () => {
    const input = `f.ts
<<<<<<< SEARCH
const x = 1;
=======
const x = 2;
>>>>>>> REPLACE`;
    const out = applyEditsSync(input, { "f.ts": "const x = 1;\nconst y = 3;\n" });
    expect(out).toHaveLength(1);
    expect(out[0]?.ok).toBe(true);
    if (out[0]?.ok) expect(out[0].after).toBe("const x = 2;\nconst y = 3;\n");
  });

  it("creates a file when SEARCH is empty", () => {
    const input = `new.ts
<<<<<<< SEARCH
=======
hello
>>>>>>> REPLACE`;
    const out = applyEditsSync(input, {});
    expect(out[0]?.ok).toBe(true);
    if (out[0]?.ok) expect(out[0].after).toBe("hello\n");
  });

  it("applies consecutive edits to the same file with the overlay", () => {
    const input = `f.ts
<<<<<<< SEARCH
1
=======
2
>>>>>>> REPLACE

f.ts
<<<<<<< SEARCH
2
=======
3
>>>>>>> REPLACE`;
    const out = applyEditsSync(input, { "f.ts": "1\n" });
    expect(out.every((r) => r.ok)).toBe(true);
    const last = out[out.length - 1];
    if (last?.ok) expect(last.after).toBe("3\n");
  });

  it("reports search-not-found with a useful message", () => {
    const input = `f.ts
<<<<<<< SEARCH
nonexistent
=======
new
>>>>>>> REPLACE`;
    const out = applyEditsSync(input, { "f.ts": "totally different\n" });
    expect(out[0]?.ok).toBe(false);
    if (!out[0]?.ok) expect(out[0]?.reason).toBe("search-not-found");
  });

  it("reports ambiguous-match when SEARCH appears twice", () => {
    const input = `f.ts
<<<<<<< SEARCH
x
=======
y
>>>>>>> REPLACE`;
    const out = applyEditsSync(input, { "f.ts": "x\nx\n" });
    expect(out[0]?.ok).toBe(false);
    if (!out[0]?.ok) expect(out[0]?.reason).toBe("ambiguous-match");
  });
});

describe("fuzzyReplace — indent-shift strategy", () => {
  it("re-indents an unindented SEARCH to match a nested block", () => {
    const original = `function outer() {
    if (cond) {
        oldLine();
    }
}
`;
    const search = `if (cond) {
    oldLine();
}`;
    const replace = `if (cond) {
    newLine();
}`;
    const r = fuzzyReplace(original, search, replace);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      expect(r.text).toContain("        newLine();");
      expect(r.text).not.toContain("oldLine");
      expect(r.strategy).toBe("indent-shift");
    }
  });
});

describe("fuzzyReplace — trim-eol strategy", () => {
  it("matches when the original has trailing whitespace the model omitted", () => {
    const original = "hello world   \nfoo\n";
    const search = "hello world\nfoo";
    const replace = "hi\nbar";
    const r = fuzzyReplace(original, search, replace);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") expect(r.text).toBe("hi\nbar\n");
  });
});
