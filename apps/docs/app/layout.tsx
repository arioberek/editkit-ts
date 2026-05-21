import "./global.css";
import { RootProvider } from "fumadocs-ui/provider/next";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: {
    default: "editkit — robust LLM edit-format toolkit for TypeScript",
    template: "%s · editkit",
  },
  description:
    "Parse and apply SEARCH/REPLACE blocks, unified diffs, and whole-file edits with battle-tested fuzzy matching ported from aider.",
  metadataBase: new URL("https://editkit.arielton.com"),
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
