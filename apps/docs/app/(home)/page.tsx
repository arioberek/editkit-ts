import Link from "next/link";
import { LiveDemo } from "./live-demo";

const RECIPES = [
  {
    slug: "test-fix-loop",
    title: "Test-fix loop",
    blurb: "Aider's canonical workflow. Failing test in, one retry on failure, then bail.",
  },
  {
    slug: "bulk-codemod",
    title: "Bulk codemod",
    blurb: "Apply a transform across every file in a directory. One file, one commit.",
  },
  {
    slug: "multi-file-refactor",
    title: "Multi-file refactor",
    blurb: "Thread a flag through N files in one response. Overlay semantics for shared files.",
  },
  {
    slug: "architect-editor",
    title: "Architect / editor split",
    blurb: "Reasoning model writes the plan. Cheap editor turns the plan into edit blocks.",
  },
  {
    slug: "lint-after-edit",
    title: "Lint-after-edit auto-fix",
    blurb: "Apply, lint, feed errors back. Catches malformed edits pre-commit.",
  },
  {
    slug: "pr-review-bot",
    title: "GitHub PR review bot",
    blurb: "On a `/fix` comment, apply reviewer feedback and push back to the PR branch.",
  },
  {
    slug: "slack-bot",
    title: "Slack-driven edits",
    blurb: "@bot edit <path> <instruction>. The bot pushes a branch you can PR.",
  },
  {
    slug: "framework-migration",
    title: "Framework migration",
    blurb: "Multi-hunk changes per file. Unified diff beats SEARCH/REPLACE here.",
  },
  {
    slug: "live-diff-preview",
    title: "Live diff preview UI",
    blurb: "streamEdits yields each completed edit. Flicker diffs into the UI live.",
  },
];

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col">
      {/* Hero */}
      <section className="relative isolate flex flex-col items-center justify-center overflow-hidden px-6 pb-16 pt-24 text-center md:pt-32">
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_50%_0%,theme(colors.fd-primary/0.12),transparent_70%)]"
        />
        <p className="mb-4 font-mono text-xs uppercase tracking-[0.25em] text-fd-muted-foreground">
          editkit · TypeScript port of aider's edit engine
        </p>
        <h1 className="max-w-4xl text-balance text-4xl font-semibold leading-[1.05] tracking-tight md:text-6xl">
          Apply LLM edits to your codebase
          <br className="hidden md:block" /> without inventing the parser.
        </h1>
        <p className="mt-6 max-w-2xl text-balance text-lg text-fd-muted-foreground md:text-xl">
          Parse and apply <code className="font-mono">SEARCH/REPLACE</code> blocks, unified diffs,
          and whole-file edits — with battle-tested fuzzy matching ported from{" "}
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
          <Link
            href="/docs/getting-started"
            className="inline-flex h-11 items-center justify-center rounded-md border border-fd-border px-6 text-sm font-medium text-fd-foreground transition hover:bg-fd-muted"
          >
            Quick start →
          </Link>
        </div>
        <pre className="mt-10 rounded-lg border border-fd-border bg-fd-card px-5 py-3 text-left text-sm">
          <code className="font-mono">npm i editkit</code>
        </pre>
      </section>

      {/* Three-format strip */}
      <section className="border-t border-fd-border bg-fd-card/30 px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-2 text-sm font-mono uppercase tracking-[0.2em] text-fd-muted-foreground">
            Three formats, one applier
          </h2>
          <p className="mb-10 max-w-2xl text-balance text-2xl font-semibold tracking-tight">
            Real models emit different formats for different tasks. editkit handles all three — and
            detects which one a response uses.
          </p>
          <div className="grid gap-4 md:grid-cols-3">
            <FormatCard
              name="search-replace"
              tagline="Default for any model"
              detail="Compact, focused, easy for small models. The aider 'diff' format."
            />
            <FormatCard
              name="unified-diff"
              tagline="Large refactors"
              detail="Multi-hunk changes per file. Diff structure prevents '...rest unchanged' placeholders."
            />
            <FormatCard
              name="whole-file"
              tagline="Bulk codemods"
              detail="Smallest models, or files < 50 lines. Rewrite the file in full, no quoting."
            />
          </div>
        </div>
      </section>

      {/* Live demo */}
      <section className="border-t border-fd-border px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-2 font-mono text-sm uppercase tracking-[0.2em] text-fd-muted-foreground">
            Try it now
          </h2>
          <p className="mb-2 max-w-2xl text-balance text-2xl font-semibold tracking-tight">
            Paste an LLM response, see the resulting file.
          </p>
          <p className="mb-8 max-w-2xl text-fd-muted-foreground">
            Runs entirely in your browser. The full parser and applier bundle to roughly 7&nbsp;kB
            minzip. The fixture below is preloaded — hit{" "}
            <kbd className="rounded border border-fd-border bg-fd-muted px-1.5 py-0.5 text-xs font-mono">
              Apply
            </kbd>{" "}
            to see the result.
          </p>
          <LiveDemo />
        </div>
      </section>

      {/* Recipes grid */}
      <section className="border-t border-fd-border bg-fd-card/30 px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <div className="mb-10 flex items-baseline justify-between">
            <div>
              <h2 className="mb-2 font-mono text-sm uppercase tracking-[0.2em] text-fd-muted-foreground">
                Recipes
              </h2>
              <p className="max-w-2xl text-balance text-2xl font-semibold tracking-tight">
                Patterns from real coding agents.
              </p>
            </div>
            <Link
              href="/docs/recipes/test-fix-loop"
              className="hidden text-sm text-fd-muted-foreground hover:text-fd-foreground md:inline"
            >
              View all →
            </Link>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {RECIPES.map((r) => (
              <Link
                key={r.slug}
                href={`/docs/recipes/${r.slug}`}
                className="group rounded-lg border border-fd-border bg-fd-background p-5 transition hover:border-fd-foreground/40 hover:bg-fd-muted/40"
              >
                <h3 className="mb-1 font-semibold tracking-tight">{r.title}</h3>
                <p className="text-sm text-fd-muted-foreground">{r.blurb}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison */}
      <section className="border-t border-fd-border px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-2 font-mono text-sm uppercase tracking-[0.2em] text-fd-muted-foreground">
            Comparison
          </h2>
          <p className="mb-10 max-w-2xl text-balance text-2xl font-semibold tracking-tight">
            How editkit stacks up.
          </p>
          <div className="overflow-x-auto rounded-lg border border-fd-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-fd-card/50 text-fd-muted-foreground">
                <tr>
                  <th className="p-4 font-medium">Project</th>
                  <th className="p-4 font-medium">Language</th>
                  <th className="p-4 font-medium">Formats</th>
                  <th className="p-4 font-medium">Streaming</th>
                  <th className="p-4 font-medium">Fuzzy match</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-fd-border">
                <tr className="bg-fd-background">
                  <td className="p-4 font-semibold">editkit</td>
                  <td className="p-4">TypeScript</td>
                  <td className="p-4">search-replace, unified-diff, whole-file</td>
                  <td className="p-4">AI SDK adapter</td>
                  <td className="p-4">3 strategies</td>
                </tr>
                <tr>
                  <td className="p-4">aider</td>
                  <td className="p-4">Python</td>
                  <td className="p-4">+4 more (architect, ask, etc.)</td>
                  <td className="p-4">—</td>
                  <td className="p-4">origin of the algorithms</td>
                </tr>
                <tr>
                  <td className="p-4">apply-multi-diff</td>
                  <td className="p-4">TypeScript</td>
                  <td className="p-4">search-replace, unified-diff</td>
                  <td className="p-4">—</td>
                  <td className="p-4">partial</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="border-t border-fd-border px-6 py-20 text-center">
        <p className="mb-4 font-mono text-xs uppercase tracking-[0.25em] text-fd-muted-foreground">
          ready in 60 seconds
        </p>
        <h2 className="mb-6 text-balance text-3xl font-semibold tracking-tight md:text-4xl">
          Stop rewriting the SEARCH/REPLACE parser.
        </h2>
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/docs/getting-started"
            className="inline-flex h-11 items-center justify-center rounded-md bg-fd-primary px-6 text-sm font-medium text-fd-primary-foreground transition hover:opacity-90"
          >
            Read the quick start
          </Link>
          <a
            href="https://github.com/arioberek/editkit-ts"
            className="inline-flex h-11 items-center justify-center rounded-md border border-fd-border px-6 text-sm font-medium text-fd-foreground transition hover:bg-fd-muted"
          >
            Star on GitHub
          </a>
        </div>
      </section>
    </main>
  );
}

function FormatCard({
  name,
  tagline,
  detail,
}: {
  name: string;
  tagline: string;
  detail: string;
}) {
  return (
    <div className="rounded-lg border border-fd-border bg-fd-background p-5">
      <code className="mb-2 inline-block font-mono text-sm text-fd-primary">{name}</code>
      <p className="mb-2 font-semibold tracking-tight">{tagline}</p>
      <p className="text-sm text-fd-muted-foreground">{detail}</p>
    </div>
  );
}
