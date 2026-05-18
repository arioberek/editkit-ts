/**
 * Recipe-level tests. Each test corresponds to one of the worked patterns in the README's
 * "Recipes" section. The LLM responses below are written to look like what a real model
 * (gpt-4o, claude-opus, gemini-pro) would emit — chatty preamble, fenced wrappers, the
 * occasional drift — so the tests prove the documented workflows survive the wild.
 */
import { describe, expect, it } from "bun:test";
import { streamEdits } from "../src/ai-sdk.ts";
import { applyEdits, applyEditsSync } from "../src/index.ts";

async function* chunked(s: string, n: number): AsyncIterable<string> {
  for (let i = 0; i < s.length; i += n) yield s.slice(i, i + n);
}

describe("Recipe: test-fix loop", () => {
  it("applies the model's fix for a failing test and reports success", async () => {
    const original = `export function add(a: number, b: number) {
  return a - b;
}
`;
    const llmResponse = `Looking at the failing test \`add(2, 3) === 5\`, the implementation has a sign typo. Here's the fix:

src/math.ts
<<<<<<< SEARCH
  return a - b;
=======
  return a + b;
>>>>>>> REPLACE`;

    const results = await applyEdits(llmResponse, { "src/math.ts": original });
    expect(results).toHaveLength(1);
    expect(results[0]?.ok).toBe(true);
    if (results[0]?.ok) {
      expect(results[0].after).toContain("return a + b;");
      expect(results[0].after).not.toContain("return a - b;");
    }
  });

  it("returns a structured error suitable for retry-prompt feedback", async () => {
    const llmResponse = `src/math.ts
<<<<<<< SEARCH
function thatDoesNotExist() {}
=======
function fixed() {}
>>>>>>> REPLACE`;
    const results = await applyEdits(llmResponse, { "src/math.ts": "function actual() {}\n" });
    expect(results[0]?.ok).toBe(false);
    const r0 = results[0];
    if (r0 && !r0.ok) {
      expect(r0.reason).toBe("search-not-found");
      expect(r0.message).toContain("src/math.ts");
      expect(r0.message.length).toBeGreaterThan(40);
    }
  });

  it("succeeds on the second attempt after feeding the parser error back", async () => {
    const file = "x = 1\n";
    const wrongAttempt = `f.ts
<<<<<<< SEARCH
y = 1
=======
y = 2
>>>>>>> REPLACE`;
    const correctedAttempt = `f.ts
<<<<<<< SEARCH
x = 1
=======
x = 2
>>>>>>> REPLACE`;

    const first = await applyEdits(wrongAttempt, { "f.ts": file });
    expect(first[0]?.ok).toBe(false);

    const second = await applyEdits(correctedAttempt, { "f.ts": file });
    expect(second[0]?.ok).toBe(true);
    if (second[0]?.ok) expect(second[0].after).toBe("x = 2\n");
  });
});

describe("Recipe: bulk codemod across a directory", () => {
  it("applies a whole-file rewrite to add JSDoc", () => {
    const original = `export function double(n: number) {
  return n * 2;
}
`;
    const llmResponse = `src/math.ts
\`\`\`ts
/** Returns its argument multiplied by two. */
export function double(n: number) {
  return n * 2;
}
\`\`\``;
    const results = applyEditsSync(
      llmResponse,
      { "src/math.ts": original },
      {
        formats: ["whole-file"],
      },
    );
    expect(results[0]?.ok).toBe(true);
    if (results[0]?.ok) {
      expect(results[0].after).toContain("/** Returns its argument");
      expect(results[0].after).toContain("return n * 2;");
    }
  });

  it("applies the same codemod across a multi-file batch", async () => {
    const files = {
      "src/a.ts": "export const a = 1;\n",
      "src/b.ts": "export const b = 2;\n",
    };
    const responses = [
      `src/a.ts
\`\`\`ts
/** the answer */
export const a = 1;
\`\`\``,
      `src/b.ts
\`\`\`ts
/** the other answer */
export const b = 2;
\`\`\``,
    ];

    const after: Record<string, string> = {};
    for (const [path, original] of Object.entries(files)) {
      const idx = path === "src/a.ts" ? 0 : 1;
      const [r] = await applyEdits(
        responses[idx] ?? "",
        { [path]: original },
        {
          formats: ["whole-file"],
        },
      );
      if (r?.ok) after[path] = r.after;
    }
    expect(after["src/a.ts"]).toContain("/** the answer */");
    expect(after["src/b.ts"]).toContain("/** the other answer */");
  });
});

describe("Recipe: multi-file refactor", () => {
  it("applies SEARCH/REPLACE blocks to four files in one response", async () => {
    const files = {
      "src/cli.ts": `import { run } from "./runner";\nrun();\n`,
      "src/config.ts": "export const config = {};\n",
      "src/runner.ts": 'export function run() { console.log("running"); }\n',
      "src/log.ts": "export const log = console.log;\n",
    };
    const llmResponse = `Threading --verbose through:

src/cli.ts
<<<<<<< SEARCH
import { run } from "./runner";
run();
=======
import { run } from "./runner";
const verbose = process.argv.includes("--verbose");
run({ verbose });
>>>>>>> REPLACE

src/config.ts
<<<<<<< SEARCH
export const config = {};
=======
export const config = { verbose: false };
>>>>>>> REPLACE

src/runner.ts
<<<<<<< SEARCH
export function run() { console.log("running"); }
=======
export function run(opts: { verbose?: boolean } = {}) {
  if (opts.verbose) console.log("running (verbose)");
  else console.log("running");
}
>>>>>>> REPLACE

src/log.ts
<<<<<<< SEARCH
export const log = console.log;
=======
export const log = (msg: string, opts?: { verbose?: boolean }) =>
  opts?.verbose ? console.log("[v]", msg) : console.log(msg);
>>>>>>> REPLACE`;

    const results = await applyEdits(llmResponse, files);
    expect(results).toHaveLength(4);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(results.map((r) => r.path)).toEqual([
      "src/cli.ts",
      "src/config.ts",
      "src/runner.ts",
      "src/log.ts",
    ]);
  });

  it("orders results by source position, not file map order", async () => {
    const llmResponse = `b.ts
<<<<<<< SEARCH
b
=======
B
>>>>>>> REPLACE

a.ts
<<<<<<< SEARCH
a
=======
A
>>>>>>> REPLACE`;
    const results = await applyEdits(llmResponse, { "a.ts": "a\n", "b.ts": "b\n" });
    expect(results.map((r) => r.path)).toEqual(["b.ts", "a.ts"]);
  });
});

describe("Recipe: architect / editor split", () => {
  it("applies edits derived from a separate architect plan", async () => {
    // The "editor" model emitted these blocks from the architect's plan
    const llmResponse = `src/auth.ts
<<<<<<< SEARCH
export async function login(email: string, password: string) {
  return checkPassword(email, password);
}
=======
export async function login(email: string, password: string) {
  return checkPassword(email, password);
}

export async function loginWithOAuth(provider: "google" | "github", code: string) {
  return exchangeOAuthCode(provider, code);
}
>>>>>>> REPLACE`;
    const original = `export async function login(email: string, password: string) {
  return checkPassword(email, password);
}
`;
    const results = await applyEdits(llmResponse, { "src/auth.ts": original });
    expect(results[0]?.ok).toBe(true);
    if (results[0]?.ok) {
      expect(results[0].after).toContain("loginWithOAuth");
      expect(results[0].after).toContain("checkPassword");
    }
  });
});

describe("Recipe: lint-after-edit", () => {
  it("returns the list of touched files for the linter to target", async () => {
    const llmResponse = `a.ts
<<<<<<< SEARCH
const x = 1
=======
const x = 1;
>>>>>>> REPLACE

b.ts
<<<<<<< SEARCH
const y = 2
=======
const y = 2;
>>>>>>> REPLACE`;
    const results = await applyEdits(llmResponse, {
      "a.ts": "const x = 1\n",
      "b.ts": "const y = 2\n",
    });
    const written = results.flatMap((r) => (r.ok ? [r.path] : []));
    expect(written).toEqual(["a.ts", "b.ts"]);
  });
});

describe("Recipe: PR review bot", () => {
  it("applies a unified diff produced by the review-bot model", async () => {
    const original = `export function greet(name: string) {
  return "Hi " + name;
}
`;
    const llmResponse = `--- a/src/greet.ts
+++ b/src/greet.ts
@@ -1,3 +1,3 @@
 export function greet(name: string) {
-  return "Hi " + name;
+  return \`Hi \${name}\`;
 }
`;
    const results = await applyEdits(
      llmResponse,
      { "src/greet.ts": original },
      { formats: ["unified-diff"] },
    );
    expect(results[0]?.ok).toBe(true);
    if (results[0]?.ok) expect(results[0].after).toContain("`Hi ${name}`");
  });
});

describe("Recipe: framework migration with multi-hunk unified diffs", () => {
  it("applies multiple hunks to one file in order", async () => {
    const original = `export function Page({ params }) {
  const id = params.id;
  return <div>{id}</div>;
}

export const metadata = {
  title: "Old",
};

export const revalidate = 60;
`;
    const llmResponse = `--- a/page.tsx
+++ b/page.tsx
@@ -1,4 +1,4 @@
-export function Page({ params }) {
-  const id = params.id;
+export async function Page({ params }: { params: Promise<{ id: string }> }) {
+  const { id } = await params;
   return <div>{id}</div>;
 }
@@ -6,3 +6,3 @@
 export const metadata = {
-  title: "Old",
+  title: "New",
 };
@@ -10,1 +10,1 @@
-export const revalidate = 60;
+export const dynamic = "force-static";
`;
    const results = await applyEdits(
      llmResponse,
      { "page.tsx": original },
      { formats: ["unified-diff"] },
    );
    expect(results[0]?.ok).toBe(true);
    if (results[0]?.ok) {
      expect(results[0].after).toContain("await params");
      expect(results[0].after).toContain('title: "New"');
      expect(results[0].after).toContain('dynamic = "force-static"');
      expect(results[0].after).not.toContain("revalidate = 60");
    }
  });
});

describe("Recipe: cross-language port (file creation)", () => {
  it("creates a new file from a whole-file response with no original", async () => {
    const llmResponse = `src/parser.rs
\`\`\`rust
pub fn parse(input: &str) -> Result<Ast, ParseError> {
    Ok(Ast::default())
}
\`\`\``;
    const results = await applyEdits(llmResponse, async () => null, {
      formats: ["whole-file"],
    });
    expect(results[0]?.ok).toBe(true);
    if (results[0]?.ok) {
      expect(results[0].path).toBe("src/parser.rs");
      expect(results[0].before).toBe("");
      expect(results[0].after).toContain("pub fn parse");
    }
  });

  it("creates a new file via SEARCH/REPLACE with an empty SEARCH section", async () => {
    const llmResponse = `src/util.go
<<<<<<< SEARCH
=======
package util

func Add(a, b int) int { return a + b }
>>>>>>> REPLACE`;
    const results = await applyEdits(llmResponse, async () => null);
    expect(results[0]?.ok).toBe(true);
    if (results[0]?.ok) expect(results[0].after).toContain("package util");
  });
});

describe("Recipe: live diff preview UI (streaming)", () => {
  it("yields one edit per file as soon as its closing fence arrives", async () => {
    const stream = chunked(
      `Working on it...

a.ts
<<<<<<< SEARCH
1
=======
2
>>>>>>> REPLACE

now b...

b.ts
<<<<<<< SEARCH
3
=======
4
>>>>>>> REPLACE`,
      7,
    );

    const out: { path: string; after?: string }[] = [];
    for await (const { result } of streamEdits(stream, { "a.ts": "1\n", "b.ts": "3\n" })) {
      out.push({ path: result.path, after: result.ok ? result.after : undefined });
    }
    expect(out).toEqual([
      { path: "a.ts", after: "2\n" },
      { path: "b.ts", after: "4\n" },
    ]);
  });

  it("streams a unified-diff edit only after the diff body finishes", async () => {
    const input = `--- a/x.ts
+++ b/x.ts
@@ -1 +1 @@
-old
+new

other prose to mark the boundary
`;
    const out: string[] = [];
    for await (const { result } of streamEdits(chunked(input, 4), { "x.ts": "old\n" })) {
      if (result.ok) out.push(result.after);
    }
    expect(out).toEqual(["new\n"]);
  });
});
