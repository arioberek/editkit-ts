import { defineConfig, defineDocs } from "fumadocs-mdx/config";

export const docs = defineDocs({
  dir: "content/docs",
});

export default defineConfig({
  mdxOptions: {
    // Allow editkit's SEARCH/REPLACE fences to render as plain text inside code blocks.
    // The default highlighter handles `ts`, `tsx`, `bash`, `diff`, `text`.
  },
});
