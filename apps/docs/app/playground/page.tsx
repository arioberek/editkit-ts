import type { Metadata } from "next";
import { Playground } from "./playground";

export const metadata: Metadata = {
  title: "Playground",
  description:
    "Paste an LLM response and a file map, run editkit's parser and applier in your browser. No backend, no API key.",
};

export default function PlaygroundPage() {
  return (
    <main className="flex flex-1 flex-col">
      <section className="border-b border-fd-border px-6 py-10">
        <div className="mx-auto max-w-6xl">
          <p className="mb-2 font-mono text-xs uppercase tracking-[0.25em] text-fd-muted-foreground">
            editkit · playground
          </p>
          <h1 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">
            Run editkit in your browser.
          </h1>
          <p className="mt-4 max-w-2xl text-fd-muted-foreground">
            Paste an LLM response on the left. Add the files it should edit on the right. Hit{" "}
            <kbd className="rounded border border-fd-border bg-fd-muted px-1.5 py-0.5 text-xs font-mono">
              Apply
            </kbd>{" "}
            — the full parser + applier bundle is shipped to your browser and runs there. No
            backend, no API key.
          </p>
        </div>
      </section>
      <section className="px-6 py-10">
        <div className="mx-auto max-w-6xl">
          <Playground />
        </div>
      </section>
    </main>
  );
}
