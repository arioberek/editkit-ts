import type { EditFormat } from "./types.ts";

const SR_FENCE = /<{5,}\s*SEARCH\b/;
const UD_FENCE = /^---\s+(?:a\/)?\S/m;
const UD_HUNK = /^@@\s+-\d+/m;

/**
 * Heuristically detect which formats appear in an LLM response. Returns the formats in
 * priority order (most-confident first). The caller can pass this into {@link parseEdits}
 * as the `formats` filter, or just iterate through them.
 *
 * The detector is intentionally permissive — it errs on the side of returning a format
 * whenever the marker tokens appear, even if the actual block is malformed. The parser
 * for that format will then reject the malformed block with a useful error.
 */
export function detectFormats(input: string): EditFormat[] {
  const formats: EditFormat[] = [];
  if (SR_FENCE.test(input)) formats.push("search-replace");
  if (UD_FENCE.test(input) && UD_HUNK.test(input)) formats.push("unified-diff");
  // whole-file is a low-confidence fallback because plain fenced code blocks are common
  // in chat. Only return it if neither SR nor UD matched and we see at least one fenced block
  // preceded by something that looks like a file path.
  if (formats.length === 0 && hasFilePathPrecedingFence(input)) {
    formats.push("whole-file");
  }
  return formats;
}

function hasFilePathPrecedingFence(input: string): boolean {
  // line-of-path followed by a triple-backtick fence within the next line or two
  const re = /^(?<path>[^\s`]+\.[a-zA-Z0-9]+)\s*\n+```/m;
  return re.test(input);
}
