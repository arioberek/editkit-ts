# editkit docs

Documentation site for [`editkit`](../../packages/editkit/). Built with [Fumadocs](https://fumadocs.dev) on Next.js. Deployed to Vercel.

## Local development

```bash
# from the repo root:
bun install
bun run docs            # next dev on http://localhost:3000

# or directly:
cd apps/docs && bun run dev
```

## Build

```bash
# from the repo root:
bun run docs:build      # turbo runs the editkit build first, then next build

# or:
bunx turbo run build --filter=editkit-docs
```

## Content

All pages live in [`content/docs/`](./content/docs) as MDX. The sidebar order is controlled
by [`content/docs/meta.json`](./content/docs/meta.json).

Adding a page:

1. Drop `content/docs/<section>/<slug>.mdx` with frontmatter:

   ```mdx
   ---
   title: My new page
   description: Short one-liner used as the page subtitle and SEO description.
   ---

   ...your MDX...
   ```

2. Add the slug (e.g. `recipes/my-new-page`) to `content/docs/meta.json` in the order it
   should appear in the sidebar.

3. `bun run docs` will hot-reload it.

## Deployment

Connected to Vercel via the GitHub integration. **Project settings:**

- Root Directory: `apps/docs`
- Framework Preset: Next.js (auto-detected)
- Build Command: handled by `vercel.json` (`turbo run build --filter=editkit-docs`)
- Install Command: leave blank — Vercel auto-runs `bun install` at the repo root because
  it detects bun workspaces
- Include source files outside the Root Directory: **enabled** (needs `packages/editkit/`)

The first deploy needs to be done from the Vercel dashboard. After that, every push to
`main` deploys to production; every PR gets a preview URL automatically.

## Why Fumadocs

- Modern aesthetic out of the box (Tailwind 4, Radix-based components, OG image
  generation)
- First-class TypeScript API generation (we may wire this in later via
  `fumadocs-typescript`)
- MDX everywhere — no JSON config to author content
- Built-in search via Orama; no Algolia account needed
- App Router-native; ships with React Server Components
