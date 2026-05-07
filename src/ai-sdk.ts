/**
 * Vercel AI SDK adapter.
 *
 * Two helpers:
 *
 * 1. {@link applyEditsFromText} — for non-streaming results (`generateText` / final
 *    `experimental_output`). It's just a re-export of the core `applyEdits`, kept here
 *    for discoverability under `editkit/ai-sdk`.
 *
 * 2. {@link streamEdits} — for streaming results. Pass an `AsyncIterable<string>` of text
 *    chunks (e.g. `streamText().textStream`) and you'll get back an async iterator that
 *    yields each completed edit as soon as its closing fence has been emitted, plus the
 *    `ApplyResult` after applying it. This is what the playground / live diff UIs in
 *    coding agents want — it lets you flicker each file's diff into the UI as the model
 *    finishes describing it, without waiting for the whole response.
 *
 * The streaming buffer keeps the entire response in memory; if you're processing 100k+
 * token responses, drop down to `applyEditsFromText` and re-parse at the end.
 *
 * No dependency on the `ai` package — we accept any `AsyncIterable<string>`, so this works
 * with the AI SDK's `textStream` and with anything else that yields chunks (raw fetch,
 * OpenAI's stream, custom SSE).
 */

import { detectFormats } from "./detect.ts";
import {
  applySearchReplace,
  parseSearchReplace,
} from "./formats/search-replace.ts";
import { applyUnifiedDiff, parseUnifiedDiff } from "./formats/unified-diff.ts";
import { applyWholeFile, parseWholeFile } from "./formats/whole-file.ts";
import type {
  ApplyOptions,
  ApplyResult,
  FileReader,
  ParsedEdit,
} from "./types.ts";

export { applyEdits as applyEditsFromText } from "./index.ts";

export interface StreamedEdit {
  /** The edit, parsed as soon as its closing fence arrived. */
  edit: ParsedEdit;
  /** The result of applying the edit to the (possibly already-modified) target file. */
  result: ApplyResult;
}

/**
 * Apply edits emitted by a streaming LLM, yielding each one as soon as it's complete.
 *
 * Edits are applied with the same overlay semantics as {@link applyEdits}: consecutive
 * edits to the same path see each other's output.
 */
export async function* streamEdits(
  stream: AsyncIterable<string>,
  files: FileReader,
  options: ApplyOptions = {},
): AsyncIterable<StreamedEdit> {
  let buffer = "";
  let cursor = 0; // index in `buffer` past which we haven't emitted edits yet
  const overlay: Record<string, string> = {};

  for await (const chunk of stream) {
    buffer += chunk;
    while (true) {
      const next = nextCompleteEdit(buffer, cursor, options);
      if (!next) break;
      cursor = next.consumedTo;
      const original = await readFile(next.edit.path, files, overlay);
      const result = applyOne(next.edit, original, options);
      if (result.ok) overlay[next.edit.path] = result.after;
      yield { edit: next.edit, result };
    }
  }

  // Flush: handle anything still un-consumed at end-of-stream. We do this by re-parsing the
  // tail as a full input — at this point we know there are no more chunks coming.
  const tail = buffer.slice(cursor);
  if (tail.trim() === "") return;

  const fmts =
    options.formats ?? (detectFormats(tail).length > 0 ? detectFormats(tail) : ["search-replace", "unified-diff", "whole-file"]);
  const finalEdits: ParsedEdit[] = [];
  if (fmts.includes("search-replace")) finalEdits.push(...parseSearchReplace(tail));
  if (fmts.includes("unified-diff")) finalEdits.push(...parseUnifiedDiff(tail));
  if (fmts.includes("whole-file")) finalEdits.push(...parseWholeFile(tail));
  finalEdits.sort((a, b) => a.range.start - b.range.start);

  for (const edit of finalEdits) {
    const original = await readFile(edit.path, files, overlay);
    const result = applyOne(edit, original, options);
    if (result.ok) overlay[edit.path] = result.after;
    yield { edit, result };
  }
}

interface NextEdit {
  edit: ParsedEdit;
  consumedTo: number;
}

/**
 * Look for the earliest *complete* edit (one whose closing marker has arrived) starting at
 * or after `from` in `buffer`. Returns null if nothing is complete yet.
 */
function nextCompleteEdit(buffer: string, from: number, options: ApplyOptions): NextEdit | null {
  const slice = buffer.slice(from);
  const formats = options.formats ?? detectFormats(slice);
  if (formats.length === 0) return null;

  const candidates: ParsedEdit[] = [];
  if (formats.includes("search-replace")) candidates.push(...parseSearchReplace(slice));
  if (formats.includes("unified-diff")) {
    // Only emit a unified-diff edit if its body is followed by a "boundary" — either another
    // file header or a blank line. Otherwise the model may still be streaming hunks.
    const ud = parseUnifiedDiff(slice);
    for (const e of ud) {
      if (isUnifiedDiffComplete(slice, e.range.end)) candidates.push(e);
    }
  }
  if (formats.includes("whole-file")) {
    // The parser only yields whole-file edits whose closing fence has been seen, so these
    // are safe.
    candidates.push(...parseWholeFile(slice));
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.range.start - b.range.start);
  const earliest = candidates[0];
  if (!earliest) return null;
  return {
    edit: {
      ...earliest,
      range: { start: earliest.range.start + from, end: earliest.range.end + from },
    },
    consumedTo: from + earliest.range.end,
  };
}

function isUnifiedDiffComplete(slice: string, end: number): boolean {
  const trailing = slice.slice(end);
  if (trailing === "") return false;
  if (/\n\s*\n/.test(trailing.slice(0, 200))) return true;
  if (/^\s*---\s+/m.test(trailing.slice(0, 200))) return true;
  return false;
}

function applyOne(
  edit: ParsedEdit,
  original: string | null,
  options: ApplyOptions,
): ApplyResult {
  if (edit.format === "search-replace") return applySearchReplace(edit, original, options);
  if (edit.format === "unified-diff") return applyUnifiedDiff(edit, original, options);
  return applyWholeFile(edit, original, options);
}

async function readFile(
  path: string,
  files: FileReader,
  overlay: Record<string, string>,
): Promise<string | null> {
  if (path in overlay) return overlay[path] ?? "";
  if (typeof files === "function") {
    try {
      const v = await files(path);
      return v ?? null;
    } catch {
      return null;
    }
  }
  return path in files ? (files[path] ?? "") : null;
}
