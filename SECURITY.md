# Security Policy

## Supported versions

We support the latest minor of the most recent major release.

| Version | Supported          |
| ------- | ------------------ |
| 0.x     | :white_check_mark: |

`editkit` is pre-1.0 and the public API is still evolving. We will backport security fixes
to the latest published 0.x release.

## Reporting a vulnerability

**Please do not file a public GitHub issue** for security problems.

Email **contact@arielton.com** with the subject line `editkit security`. Include:

- A description of the issue and its impact (e.g. arbitrary file write, path traversal,
  prompt-injection-driven write-outside-workspace).
- The smallest reproduction you can produce (input, version, environment).
- Whether you would like credit in the fix's release notes.

I'll acknowledge receipt within 72 hours, and target a fix within 14 days for critical
issues. The fix will ship as a patch release via the normal Changesets workflow, with a
GitHub Security Advisory published alongside the release.

## Scope

`editkit` parses untrusted LLM output and produces edits that are then written to disk by
the caller. Some classes of issue:

- **In scope**: a crafted LLM response that, when passed to `applyEdits`, causes a write to
  a path outside the file map's keys; an input that crashes the parser; an input that
  produces edits with `ok: true` but mangled content.
- **Out of scope**: the *caller* writing `result.after` to disk without sanitizing
  `result.path`. `editkit` returns the path the LLM emitted; it is the caller's job to
  decide whether that path is safe to write to. (The README and recipes show patterns
  for this, but it's not enforced.)

If you're not sure whether something is in scope, report it and we'll make the call
together.
