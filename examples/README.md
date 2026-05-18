# editkit examples

Runnable examples that show editkit in real-world workflows. Each example is its own
workspace package and depends on `editkit` via `workspace:*`, so they exercise the public
package interface (not the internal source).

| Example | What it shows | Run from repo root |
| ------- | ------------- | ------------------ |
| [ai-sdk-v5](./ai-sdk-v5) | Smallest possible `streamEdits` demo: one file, one OpenAI call. | `OPENAI_API_KEY=... bun run --filter editkit-example-ai-sdk-v5 demo` |
| [agent-loop](./agent-loop) | Aider's canonical test-fix loop with a deterministic mock LLM. Runs offline, shows structured-failure retry. | `bun run --filter editkit-example-agent-loop demo` |
| [mini-coding-agent](./mini-coding-agent) | A real coding-agent loop: multi-file edits across all three formats, structured failure recovery, runs offline with recorded fixtures. | `bun run build && bun run --filter editkit-example-mini-coding-agent demo` |

**Tip:** New users — start with `mini-coding-agent`. It runs without an API key and shows
the full picture.

## Setup

```bash
# Once, at the repo root:
bun install        # installs all workspace deps
bun run build      # builds the editkit package (mini-coding-agent imports from dist/)
```
