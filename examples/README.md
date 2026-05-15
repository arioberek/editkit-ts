# editkit examples

Runnable examples that show editkit in real-world workflows.

| Example | What it shows | Run with |
| ------- | ------------- | -------- |
| [ai-sdk-v5](./ai-sdk-v5) | Smallest possible `streamEdits` demo: one file, one OpenAI call. | `cd examples/ai-sdk-v5 && OPENAI_API_KEY=... bun run example.ts` |
| [mini-coding-agent](./mini-coding-agent) | A real coding-agent loop: multi-file edits across all three formats, structured failure recovery, runs offline with recorded fixtures. | `cd examples/mini-coding-agent && bun install && bun run demo` |

**Tip:** New users — start with `mini-coding-agent`. It runs without an API key and shows the full picture.
