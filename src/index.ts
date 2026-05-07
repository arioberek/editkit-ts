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
  EditFormat,
  FileReader,
  ParsedEdit,
} from "./types.ts";

export type {
  ApplyFailureReason,
  ApplyOptions,
  ApplyResult,
  EditFormat,
  FileMap,
  FileReader,
  ParsedEdit,
  SearchReplaceEdit,
  UnifiedDiffEdit,
  UnifiedDiffHunk,
  WholeFileEdit,
} from "./types.ts";

export { detectFormats } from "./detect.ts";
export { EditkitError } from "./errors.ts";
export { fuzzyReplace } from "./apply/fuzzy.ts";
export { parseSearchReplace } from "./formats/search-replace.ts";
export { parseUnifiedDiff } from "./formats/unified-diff.ts";
export { parseWholeFile } from "./formats/whole-file.ts";

/**
 * Parse all edits from an LLM response, regardless of format.
 *
 * If `formats` is provided, only those formats are attempted (in order). Otherwise we
 * detect formats heuristically and parse each. Edits are returned in the order they appear
 * in the source text, sorted by `range.start`.
 */
export function parseEdits(
  input: string,
  options: { formats?: EditFormat[] } = {},
): ParsedEdit[] {
  const formats = options.formats ?? defaultFormats(input);
  const all: ParsedEdit[] = [];
  for (const fmt of formats) {
    if (fmt === "search-replace") all.push(...parseSearchReplace(input));
    else if (fmt === "unified-diff") all.push(...parseUnifiedDiff(input));
    else if (fmt === "whole-file") all.push(...parseWholeFile(input));
  }
  all.sort((a, b) => a.range.start - b.range.start);
  return all;
}

function defaultFormats(input: string): EditFormat[] {
  const detected = detectFormats(input);
  // If detection returned anything, trust it. Otherwise try all formats — better to give the
  // parsers a shot than silently return [].
  return detected.length > 0 ? detected : ["search-replace", "unified-diff", "whole-file"];
}

/**
 * Parse and apply edits from an LLM response in one call.
 *
 * @param input    The raw LLM output (or any string containing edits).
 * @param files    Either a `{ path: contents }` map or an async function that resolves
 *                 a path to its current file contents. Return `null` (or throw) for
 *                 paths that don't exist — the applier will treat the edit as a "create"
 *                 if the format and options allow it.
 * @param options  See {@link ApplyOptions}.
 * @returns        One {@link ApplyResult} per parsed edit, in source order. `ok: true`
 *                 results carry the new file contents in `after`; the caller is responsible
 *                 for writing them to disk (or rolling back on partial failure).
 */
export async function applyEdits(
  input: string,
  files: FileReader,
  options: ApplyOptions = {},
): Promise<ApplyResult[]> {
  const edits = parseEdits(input, { formats: options.formats });
  const results: ApplyResult[] = [];
  // Track applied changes so consecutive edits to the same path see each other's output.
  const overlay: Record<string, string> = {};

  for (const edit of edits) {
    const original = await readFile(edit.path, files, overlay);
    const result = applyOne(edit, original, options);
    results.push(result);
    if (result.ok) overlay[edit.path] = result.after;
  }
  return results;
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

/**
 * Synchronous variant of {@link applyEdits}. Requires a synchronous {@link FileReader}
 * (i.e. a `FileMap`).
 */
export function applyEditsSync(
  input: string,
  files: Record<string, string>,
  options: ApplyOptions = {},
): ApplyResult[] {
  const edits = parseEdits(input, { formats: options.formats });
  const results: ApplyResult[] = [];
  const overlay: Record<string, string> = {};
  for (const edit of edits) {
    const original =
      edit.path in overlay
        ? (overlay[edit.path] ?? "")
        : edit.path in files
          ? (files[edit.path] ?? "")
          : null;
    const result = applyOne(edit, original, options);
    results.push(result);
    if (result.ok) overlay[edit.path] = result.after;
  }
  return results;
}
