# Contributing to editkit

Thanks for taking the time to contribute. This document covers what you need to know to
get a change landed.

## Code of Conduct

By participating, you agree to abide by the [Code of Conduct](./CODE_OF_CONDUCT.md).

## Prerequisites

- [Bun](https://bun.sh) ≥ 1.1.38 (the repo's `packageManager`)
- Node.js ≥ 18 (only needed because the published package targets Node 18+; Bun runs the
  workspace itself)
- Git

## Getting set up

```bash
git clone https://github.com/arioberek/editkit-ts.git
cd editkit-ts
bun install
bun run build      # builds editkit so examples can import from dist/
bun run test       # all package tests (turbo-cached)
```

## Repo layout

See the [main README](./README.md#repo-layout). The library lives in
`packages/editkit/`; examples in `examples/`.

## Making changes

1. **Branch off `main`.** Name the branch after the change, e.g. `fix/whole-file-crlf`.
2. **Add or update tests.** The library has 40+ adversarial fixtures in
   `packages/editkit/tests/`; please add one for any new edit-format edge case.
3. **Keep the public API surface small.** Anything exported from `packages/editkit/src/index.ts`
   (or `src/ai-sdk.ts`) is part of the contract. Prefer internal helpers for new code.
4. **Run the checks locally** before pushing:

   ```bash
   bun run typecheck
   bun run lint
   bun run test
   bun run build
   ```

5. **Add a changeset** if your change should ship to npm:

   ```bash
   bun run changeset
   ```

   Pick `editkit`, choose `patch`/`minor`/`major`, and write a one-paragraph summary. Docs,
   CI, internal refactors, and example-only changes don't need a changeset.

6. **Open a PR** against `main`. Fill in the template. The CI checks must pass before
   review.

## Commit style

No strict format required, but please make the subject readable on a one-line `git log`.
Conventional Commits (`fix:`, `feat:`, `chore:`, `docs:`) are welcome.

## Tests

We use [`bun test`](https://bun.sh/docs/cli/test). Tests live next to the package they
cover:

```
packages/editkit/tests/
├── coverage.test.ts
├── recipes.test.ts        # asserts the README recipes still work
├── search-replace.test.ts
├── unified-diff.test.ts
└── ...
```

Run a single test file:

```bash
cd packages/editkit
bun test tests/search-replace.test.ts
```

The `recipes.test.ts` file is special: every recipe in the README has a corresponding test.
If you change a recipe, update the test (or vice versa).

## Adding a new edit format

If you're proposing a new format (e.g. one of aider's `architect`/`udiff-simple` variants):

1. Open an issue first to discuss the format and prompt.
2. Add the parser in `packages/editkit/src/formats/<name>.ts`.
3. Add the applier in the same file (or under `apply/` if it shares logic).
4. Wire it into `parseEdits` / `applyEdits` / `streamEdits` in `index.ts` and `ai-sdk.ts`.
5. Add fixtures and adversarial tests in `packages/editkit/tests/`.
6. Update the README recipes section with a usage snippet.

## Releasing (maintainers)

You don't need to do anything manual. `changesets/action` opens a "Version Packages" PR
whenever there's an unreleased changeset on `main`. Merging that PR publishes to npm with
provenance and creates a GitHub release.

If you need to publish a pre-release (e.g. `0.2.0-next.0`):

```bash
bun run changeset pre enter next
bun run changeset
git commit -am "chore: enter pre mode"
git push
# ... merge the Version PR to publish the pre-release ...
bun run changeset pre exit
```

## Questions

Open a [discussion](https://github.com/arioberek/editkit-ts/discussions) or file an
[issue](https://github.com/arioberek/editkit-ts/issues).
