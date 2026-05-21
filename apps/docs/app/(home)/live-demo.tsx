"use client";

import { applyEditsSync } from "editkit";
import { useMemo, useState } from "react";

const DEFAULT_FILE = `export function add(a: number, b: number) {
  return a - b;
}

export function subtract(a: number, b: number) {
  return a + b;
}
`;

const DEFAULT_LLM = `src/math.ts
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
`;

export function LiveDemo() {
  const [llm, setLlm] = useState(DEFAULT_LLM);
  const [file, setFile] = useState(DEFAULT_FILE);
  const [applied, setApplied] = useState(false);

  const result = useMemo(() => {
    if (!applied) return null;
    try {
      const results = applyEditsSync(llm, { "src/math.ts": file });
      return results;
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }, [llm, file, applied]);

  const ok = Array.isArray(result) ? result.filter((r) => r.ok) : [];
  const failed = Array.isArray(result) ? result.filter((r) => !r.ok) : [];
  const finalFile = ok.length > 0 ? (ok[ok.length - 1] as { ok: true; after: string }).after : null;

  return (
    <div className="rounded-lg border border-fd-border bg-fd-card/50 p-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Pane label="LLM response">
          <textarea
            value={llm}
            onChange={(e) => {
              setLlm(e.target.value);
              setApplied(false);
            }}
            spellCheck={false}
            className="h-72 w-full resize-none rounded-md border border-fd-border bg-fd-background p-3 font-mono text-xs leading-relaxed text-fd-foreground focus:border-fd-foreground/40 focus:outline-none"
          />
        </Pane>
        <Pane label="src/math.ts (current)">
          <textarea
            value={file}
            onChange={(e) => {
              setFile(e.target.value);
              setApplied(false);
            }}
            spellCheck={false}
            className="h-72 w-full resize-none rounded-md border border-fd-border bg-fd-background p-3 font-mono text-xs leading-relaxed text-fd-foreground focus:border-fd-foreground/40 focus:outline-none"
          />
        </Pane>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setApplied(true)}
          className="inline-flex h-10 items-center justify-center rounded-md bg-fd-primary px-5 text-sm font-medium text-fd-primary-foreground transition hover:opacity-90"
        >
          Apply
        </button>
        <button
          type="button"
          onClick={() => {
            setLlm(DEFAULT_LLM);
            setFile(DEFAULT_FILE);
            setApplied(false);
          }}
          className="inline-flex h-10 items-center justify-center rounded-md border border-fd-border px-5 text-sm text-fd-foreground transition hover:bg-fd-muted"
        >
          Reset
        </button>
        {applied && Array.isArray(result) && (
          <span className="font-mono text-xs text-fd-muted-foreground">
            {ok.length} ok · {failed.length} failed
          </span>
        )}
      </div>

      {applied && result && (
        <div className="mt-4">
          {"error" in (result as object) ? (
            <Pane label="Parse error">
              <pre className="rounded-md border border-fd-border bg-fd-background p-3 font-mono text-xs text-red-500">
                {(result as { error: string }).error}
              </pre>
            </Pane>
          ) : (
            <>
              {finalFile && (
                <Pane label="Resulting src/math.ts">
                  <pre className="max-h-72 overflow-auto rounded-md border border-fd-border bg-fd-background p-3 font-mono text-xs leading-relaxed text-fd-foreground">
                    {finalFile}
                  </pre>
                </Pane>
              )}
              {failed.length > 0 && (
                <div className="mt-3">
                  <Pane label={`${failed.length} failed edit${failed.length === 1 ? "" : "s"}`}>
                    <ul className="space-y-2">
                      {failed.map((f) => {
                        const failure = f as {
                          path: string;
                          reason: string;
                          message: string;
                        };
                        return (
                          <li
                            key={`${failure.path}-${failure.reason}-${failure.message}`}
                            className="rounded-md border border-fd-border bg-fd-background p-3 font-mono text-xs"
                          >
                            <div className="mb-1 text-red-500">{failure.reason}</div>
                            <div className="text-fd-muted-foreground">{failure.message}</div>
                          </li>
                        );
                      })}
                    </ul>
                  </Pane>
                </div>
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
