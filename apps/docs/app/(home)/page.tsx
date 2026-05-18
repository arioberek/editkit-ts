import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
      <p className="mb-3 text-xs font-mono uppercase tracking-[0.2em] text-fd-muted-foreground">
        editkit · v0
      </p>
      <h1 className="max-w-3xl text-balance text-4xl font-semibold tracking-tight md:text-6xl">
        Apply LLM edits to your codebase without inventing the parser.
      </h1>
      <p className="mt-6 max-w-2xl text-balance text-lg text-fd-muted-foreground">
        Parse and apply <code className="font-mono">SEARCH/REPLACE</code> blocks, unified diffs, and
        whole-file edits — with battle-tested fuzzy matching ported from{" "}
        <a className="underline underline-offset-4" href="https://github.com/paul-gauthier/aider">
          aider
        </a>
        . Zero runtime dependencies. ESM-only. Node 18+.
      </p>
      <div className="mt-10 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/docs"
          className="inline-flex h-11 items-center justify-center rounded-md bg-fd-primary px-6 text-sm font-medium text-fd-primary-foreground transition hover:opacity-90"
        >
          Read the docs
        </Link>
        <a
          href="https://github.com/arioberek/editkit-ts"
          className="inline-flex h-11 items-center justify-center rounded-md border border-fd-border px-6 text-sm font-medium text-fd-foreground transition hover:bg-fd-muted"
        >
          View on GitHub
        </a>
      </div>
      <pre className="mt-12 rounded-lg border border-fd-border bg-fd-card px-5 py-3 text-left text-sm">
        <code className="font-mono">npm i editkit</code>
      </pre>
    </main>
  );
}
