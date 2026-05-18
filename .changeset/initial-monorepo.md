---
"editkit": minor
---

Restructured the repository as a Turborepo monorepo with Bun workspaces. No public API
changes — `editkit` and `editkit/ai-sdk` entry points are unchanged. The published package
is now built from `packages/editkit/`. Examples are now workspace packages that depend on
`editkit` via `workspace:*` instead of `file:../..`.

This release also adds:

- A Changesets-driven release pipeline (see [.changeset/README.md](./.changeset/README.md)).
- GitHub Actions CI (typecheck, lint, test, build on PR/push) and release automation
  (publishes to npm with provenance on Version Packages merges).
- `sideEffects: false` in the package manifest, so bundlers can tree-shake unused exports
  more aggressively.
- Contribution guide, code of conduct, security policy, and PR/issue templates.
