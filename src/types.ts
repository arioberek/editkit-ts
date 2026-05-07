/**
 * Identifiers for the supported edit formats.
 *
 * - `search-replace` — fenced `<<<<<<< SEARCH ... ======= ... >>>>>>> REPLACE` blocks (aider's "diff" format).
 * - `unified-diff`   — standard `--- a/x\n+++ b/x\n@@ ... @@` hunks.
 * - `whole-file`     — a path followed by a fenced code block containing the file's new full contents.
 */
export type EditFormat = "search-replace" | "unified-diff" | "whole-file";

/** A parsed but not-yet-applied edit. */
export type ParsedEdit = SearchReplaceEdit | UnifiedDiffEdit | WholeFileEdit;

export interface SearchReplaceEdit {
  format: "search-replace";
  path: string;
  search: string;
  replace: string;
  /** Byte/char range within the source LLM output that produced this edit. Useful for diagnostics. */
  range: { start: number; end: number };
}

export interface UnifiedDiffEdit {
  format: "unified-diff";
  path: string;
  /** Original path before rename, when `--- a/x` and `+++ b/y` differ. */
  oldPath?: string;
  hunks: UnifiedDiffHunk[];
  range: { start: number; end: number };
}

export interface UnifiedDiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  /** Lines including their leading marker: ` `, `+`, or `-`. */
  lines: string[];
}

export interface WholeFileEdit {
  format: "whole-file";
  path: string;
  contents: string;
  range: { start: number; end: number };
}

/** Result of applying a single edit. */
export type ApplyResult =
  | { ok: true; path: string; before: string; after: string; edit: ParsedEdit }
  | {
      ok: false;
      path: string;
      reason: ApplyFailureReason;
      message: string;
      edit: ParsedEdit;
    };

export type ApplyFailureReason =
  | "search-not-found"
  | "ambiguous-match"
  | "missing-original"
  | "hunk-context-mismatch"
  | "invalid-format"
  | "io-error";

/** Map of file path → current contents. The orchestrator does not touch the disk; the caller passes
 *  current file contents and decides what to do with the result. */
export type FileMap = Record<string, string>;

/** A reader for original file contents. Either a synchronous map or a function.
 *
 * Functions may return `null` (or throw) for paths that don't exist. The applier treats
 * a missing file as a "create" when `allowCreate` is true and the edit format supports
 * creation (empty SEARCH for search-replace, `/dev/null` source for unified-diff, any
 * whole-file edit). */
export type FileReader = FileMap | ((path: string) => string | null | Promise<string | null>);

/** Options that influence parsing and applying. */
export interface ApplyOptions {
  /**
   * Hint about which formats to consider, in priority order. If omitted, we try all formats.
   * Useful when you've prompted the model in a specific format and want hard-fails on the others.
   */
  formats?: EditFormat[];
  /**
   * If true (default), tolerate leading-whitespace differences when matching SEARCH blocks.
   * Aider does this by default; disable if your model reliably preserves indentation.
   */
  fuzzyWhitespace?: boolean;
  /**
   * Allow creating a new file when an edit targets a path not in the FileReader. Default: true
   * (matches aider's "create the file if SEARCH is empty" behaviour).
   */
  allowCreate?: boolean;
}
