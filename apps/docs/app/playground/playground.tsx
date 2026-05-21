"use client";

import { type ApplyResult, applyEditsSync, detectFormats, parseEdits } from "editkit";
import { useMemo, useState } from "react";

interface FixtureFile {
  path: string;
  contents: string;
}

interface Fixture {
  id: string;
  label: string;
  blurb: string;
  llm: string;
  files: FixtureFile[];
}

const FIXTURES: Fixture[] = [
  {
    id: "search-replace",
    label: "SEARCH/REPLACE",
    blurb: "Fix a subtle bug with two surgical edits.",
    llm: `src/math.ts
<<<<<<< SEARCH
export function add(a: number, b: number) {
  return a - b;
}
=======
export function add(a: number, b: number) {
  return a + b;
}
>>>>>>> REPLACE

src/math.ts
<<<<<<< SEARCH
export function subtract(a: number, b: number) {
  return a + b;
}
=======
export function subtract(a: number, b: number) {
  return a - b;
}
>>>>>>> REPLACE
`,
    files: [
      {
        path: "src/math.ts",
        contents: `export function add(a: number, b: number) {
  return a - b;
}

export function subtract(a: number, b: number) {
  return a + b;
}
`,
      },
    ],
  },
  {
    id: "unified-diff",
    label: "Unified diff",
    blurb: "Multi-hunk refactor with line-number drift tolerance.",
    llm: `--- a/src/auth.ts
+++ b/src/auth.ts
@@ -1,8 +1,12 @@
 import { createHash } from "node:crypto";

 export async function login(email: string, password: string) {
-  const hash = createHash("md5").update(password).digest("hex");
+  const hash = createHash("sha256").update(password).digest("hex");
   const user = await db.user.findUnique({ where: { email } });
-  if (user?.passwordHash !== hash) throw new Error("invalid");
+  if (user?.passwordHash !== hash) {
+    await audit.log("login.failed", { email });
+    throw new Error("invalid credentials");
+  }
+  await audit.log("login.success", { email, userId: user.id });
   return user;
 }
`,
    files: [
      {
        path: "src/auth.ts",
        contents: `import { createHash } from "node:crypto";

export async function login(email: string, password: string) {
  const hash = createHash("md5").update(password).digest("hex");
  const user = await db.user.findUnique({ where: { email } });
  if (user?.passwordHash !== hash) throw new Error("invalid");
  return user;
}
`,
      },
    ],
  },
  {
    id: "whole-file",
    label: "Whole-file",
    blurb: "Create a new file from scratch.",
    llm: `src/parser.ts
\`\`\`ts
export interface Token {
  type: "word" | "number" | "punct";
  value: string;
  pos: number;
}

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (/\\s/.test(ch)) { i++; continue; }
    if (/\\d/.test(ch)) {
      let value = "";
      const pos = i;
      while (i < input.length && /\\d/.test(input[i])) value += input[i++];
      tokens.push({ type: "number", value, pos });
    } else if (/\\w/.test(ch)) {
      let value = "";
      const pos = i;
      while (i < input.length && /\\w/.test(input[i])) value += input[i++];
      tokens.push({ type: "word", value, pos });
    } else {
      tokens.push({ type: "punct", value: ch, pos: i++ });
    }
  }
  return tokens;
}
\`\`\`
`,
    files: [],
  },
  {
    id: "mixed",
    label: "Mixed formats",
    blurb: "All three formats in one response — opt in with explicit `formats`.",
    llm: `src/store.ts
<<<<<<< SEARCH
export class Store {
  data = new Map<string, unknown>();
  set(k: string, v: unknown) { this.data.set(k, v); }
  get(k: string) { return this.data.get(k); }
}
=======
export class Store {
  data = new Map<string, unknown>();
  set(k: string, v: unknown) { this.data.set(k, v); }
  get(k: string) { return this.data.get(k); }
  delete(k: string) { return this.data.delete(k); }
}
>>>>>>> REPLACE

--- a/src/logger.ts
+++ b/src/logger.ts
@@ -1,3 +1,4 @@
+import { hostname } from "node:os";
 export function log(level: string, message: string) {
-  console.log(\`[\${level}] \${message}\`);
+  console.log(\`[\${hostname()}] [\${level}] \${message}\`);
 }

src/ttl.ts
\`\`\`ts
export class TTLMap<V> {
  private store = new Map<string, { value: V; expiresAt: number }>();
  set(key: string, value: V, ttlMs: number) {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }
  get(key: string): V | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt < Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }
}
\`\`\`
`,
    files: [
      {
        path: "src/store.ts",
        contents: `export class Store {
  data = new Map<string, unknown>();
  set(k: string, v: unknown) { this.data.set(k, v); }
  get(k: string) { return this.data.get(k); }
}
`,
      },
      {
        path: "src/logger.ts",
        contents: `export function log(level: string, message: string) {
  console.log(\`[\${level}] \${message}\`);
}
`,
      },
    ],
  },
];

export function Playground() {
  const [fixtureId, setFixtureId] = useState<string>(FIXTURES[0].id);
  const [llm, setLlm] = useState(FIXTURES[0].llm);
  const [files, setFiles] = useState<FixtureFile[]>(FIXTURES[0].files);
  const [autoFormats, setAutoFormats] = useState(true);
  const [selectedFormats, setSelectedFormats] = useState<Set<string>>(
    new Set(["search-replace", "unified-diff", "whole-file"]),
  );
  const [applied, setApplied] = useState(false);

  const detected = useMemo(() => detectFormats(llm), [llm]);
  const formatsOption = autoFormats
    ? undefined
    : (Array.from(selectedFormats) as Array<"search-replace" | "unified-diff" | "whole-file">);

  const parsed = useMemo(() => {
    try {
      return parseEdits(llm, formatsOption ? { formats: formatsOption } : undefined);
    } catch {
      return [];
    }
  }, [llm, formatsOption]);

  const result = useMemo(() => {
    if (!applied) return null;
    try {
      const fileMap: Record<string, string> = {};
      for (const f of files) fileMap[f.path] = f.contents;
      return applyEditsSync(llm, fileMap, formatsOption ? { formats: formatsOption } : undefined);
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) } as const;
    }
  }, [llm, files, formatsOption, applied]);

  function loadFixture(id: string) {
    const fixture = FIXTURES.find((f) => f.id === id);
    if (!fixture) return;
    setFixtureId(id);
    setLlm(fixture.llm);
    setFiles(fixture.files);
    setApplied(false);
  }

  function updateFilePath(idx: number, path: string) {
    setFiles((current) => current.map((f, i) => (i === idx ? { ...f, path } : f)));
    setApplied(false);
  }

  function updateFileContents(idx: number, contents: string) {
    setFiles((current) => current.map((f, i) => (i === idx ? { ...f, contents } : f)));
    setApplied(false);
  }

  function addFile() {
    setFiles((current) => [...current, { path: `src/new-${current.length + 1}.ts`, contents: "" }]);
    setApplied(false);
  }

  function removeFile(idx: number) {
    setFiles((current) => current.filter((_, i) => i !== idx));
    setApplied(false);
  }

  const okResults = Array.isArray(result) ? result.filter((r) => r.ok) : [];
  const failedResults = Array.isArray(result) ? result.filter((r) => !r.ok) : [];

  return (
    <div className="flex flex-col gap-6">
      {/* Fixture switcher */}
      <div className="flex flex-wrap gap-2">
        {FIXTURES.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => loadFixture(f.id)}
            className={`rounded-full border px-4 py-1.5 text-xs font-medium transition ${
              fixtureId === f.id
                ? "border-fd-foreground bg-fd-foreground text-fd-background"
                : "border-fd-border text-fd-muted-foreground hover:border-fd-foreground/40 hover:text-fd-foreground"
            }`}
            title={f.blurb}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Options */}
      <div className="flex flex-wrap items-center gap-4 rounded-md border border-fd-border bg-fd-card/40 px-4 py-3 text-xs">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={autoFormats}
            onChange={(e) => {
              setAutoFormats(e.target.checked);
              setApplied(false);
            }}
          />
          <span>auto-detect formats</span>
        </label>
        {!autoFormats && (
          <div className="flex items-center gap-3">
            {(["search-replace", "unified-diff", "whole-file"] as const).map((fmt) => (
              <label key={fmt} className="flex items-center gap-1.5 font-mono">
                <input
                  type="checkbox"
                  checked={selectedFormats.has(fmt)}
                  onChange={(e) => {
                    setSelectedFormats((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(fmt);
                      else next.delete(fmt);
                      return next;
                    });
                    setApplied(false);
                  }}
                />
                {fmt}
              </label>
            ))}
          </div>
        )}
        <div className="ml-auto flex items-center gap-2 font-mono text-fd-muted-foreground">
          <span>detected:</span>
          {detected.length === 0 ? (
            <span className="text-fd-muted-foreground/60">—</span>
          ) : (
            detected.map((f) => (
              <span
                key={f}
                className="rounded border border-fd-border bg-fd-background px-2 py-0.5"
              >
                {f}
              </span>
            ))
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* LLM input */}
        <Pane label="LLM response">
          <textarea
            value={llm}
            onChange={(e) => {
              setLlm(e.target.value);
              setApplied(false);
            }}
            spellCheck={false}
            className="h-96 w-full resize-y rounded-md border border-fd-border bg-fd-background p-3 font-mono text-xs leading-relaxed text-fd-foreground focus:border-fd-foreground/40 focus:outline-none"
          />
          <p className="mt-2 font-mono text-xs text-fd-muted-foreground">
            {parsed.length} edit{parsed.length === 1 ? "" : "s"} parsed
          </p>
        </Pane>

        {/* Files */}
        <Pane label={`Files (${files.length})`}>
          <div className="flex flex-col gap-3">
            {files.map((f, i) => (
              <div
                key={`${f.path}-${i}`}
                className="rounded-md border border-fd-border bg-fd-background"
              >
                <div className="flex items-center justify-between gap-2 border-b border-fd-border p-2">
                  <input
                    value={f.path}
                    onChange={(e) => updateFilePath(i, e.target.value)}
                    className="flex-1 bg-transparent font-mono text-xs focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    className="rounded px-2 py-0.5 text-xs text-fd-muted-foreground hover:bg-fd-muted hover:text-fd-foreground"
                  >
                    ×
                  </button>
                </div>
                <textarea
                  value={f.contents}
                  onChange={(e) => updateFileContents(i, e.target.value)}
                  spellCheck={false}
                  className="h-32 w-full resize-y bg-transparent p-3 font-mono text-xs leading-relaxed focus:outline-none"
                />
              </div>
            ))}
            <button
              type="button"
              onClick={addFile}
              className="rounded-md border border-dashed border-fd-border py-2 text-xs text-fd-muted-foreground transition hover:border-fd-foreground/40 hover:text-fd-foreground"
            >
              + add file
            </button>
          </div>
        </Pane>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setApplied(true)}
          className="inline-flex h-10 items-center justify-center rounded-md bg-fd-primary px-5 text-sm font-medium text-fd-primary-foreground transition hover:opacity-90"
        >
          Apply
        </button>
        <button
          type="button"
          onClick={() => loadFixture(fixtureId)}
          className="inline-flex h-10 items-center justify-center rounded-md border border-fd-border px-5 text-sm text-fd-foreground transition hover:bg-fd-muted"
        >
          Reset to fixture
        </button>
        {applied && Array.isArray(result) && (
          <span className="font-mono text-xs text-fd-muted-foreground">
            {okResults.length} ok · {failedResults.length} failed
          </span>
        )}
      </div>

      {/* Results */}
      {applied && result && (
        <div className="flex flex-col gap-4">
          {"error" in (result as object) ? (
            <Pane label="Parse error">
              <pre className="rounded-md border border-fd-border bg-fd-background p-3 font-mono text-xs text-red-500">
                {(result as { error: string }).error}
              </pre>
            </Pane>
          ) : (
            <>
              {okResults.length > 0 && (
                <Pane label="Successful edits">
                  <ul className="flex flex-col gap-3">
                    {okResults.map((r) => {
                      const success = r as Extract<ApplyResult, { ok: true }>;
                      return (
                        <li
                          key={`${success.path}-${success.edit.range.start}`}
                          className="rounded-md border border-fd-border bg-fd-background"
                        >
                          <div className="flex items-center justify-between gap-2 border-b border-fd-border p-2">
                            <code className="font-mono text-xs">{success.path}</code>
                            <span className="rounded bg-fd-muted px-2 py-0.5 font-mono text-[10px] text-fd-muted-foreground">
                              {success.edit.format}
                            </span>
                          </div>
                          <pre className="max-h-72 overflow-auto p-3 font-mono text-xs leading-relaxed">
                            {success.after}
                          </pre>
                        </li>
                      );
                    })}
                  </ul>
                </Pane>
              )}
              {failedResults.length > 0 && (
                <Pane label="Failed edits">
                  <ul className="flex flex-col gap-2">
                    {failedResults.map((r) => {
                      const failure = r as Extract<ApplyResult, { ok: false }>;
                      return (
                        <li
                          key={`${failure.path}-${failure.reason}-${failure.edit.range.start}`}
                          className="rounded-md border border-fd-border bg-fd-background p-3 font-mono text-xs"
                        >
                          <div className="mb-1 flex items-center gap-2">
                            <code className="text-fd-foreground">{failure.path}</code>
                            <span className="rounded bg-red-500/10 px-2 py-0.5 text-[10px] text-red-500">
                              {failure.reason}
                            </span>
                          </div>
                          <div className="text-fd-muted-foreground">{failure.message}</div>
                        </li>
                      );
                    })}
                  </ul>
                </Pane>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Pane({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 font-mono text-xs uppercase tracking-[0.15em] text-fd-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}
