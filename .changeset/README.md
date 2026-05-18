# Changesets

This folder is configured with [Changesets](https://github.com/changesets/changesets) for
managing releases of `editkit`.

## Adding a changeset

When you make a change that should be published to npm, add a changeset:

```bash
bun run changeset
```

The CLI will ask:

1. **Which packages changed.** Pick `editkit` (example packages are ignored — they're
   private and never published).
2. **What kind of bump.** `patch` for fixes, `minor` for new features, `major` for
   breaking changes.
3. **A summary.** This text shows up in the CHANGELOG and the GitHub release notes.

Commit the resulting `.changeset/<random-name>.md` file with your PR.

## What happens on merge

When your PR merges to `main`, the `release` GitHub Actions workflow runs `changesets/action`,
which either:

- **Opens (or updates) a "Version Packages" PR** that consumes all unreleased changesets,
  bumps versions in `package.json`, and writes them into `CHANGELOG.md`. Merging this PR
  triggers the publish step.
- **Publishes to npm and creates a GitHub release** when the Version Packages PR is merged.

The publish step uses `NPM_TOKEN` (repo secret) with provenance enabled via
[npm provenance](https://docs.npmjs.com/generating-provenance-statements).

## I don't need a release for this change

Skip the changeset. Pure docs, internal refactors, CI tweaks, and example-only changes
don't need to ship. The release workflow will simply skip the Version PR until something
publishable lands.

If you want to be explicit:

```bash
bun run changeset --empty
```
