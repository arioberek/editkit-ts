import type {
  ApplyFailureReason,
  ApplyOptions,
  ApplyResult,
  SearchReplaceEdit,
} from "../types.ts";
import { fuzzyReplace } from "../apply/fuzzy.ts";

/**
 * Parser & applier for aider's `SEARCH/REPLACE` block format.
 *
 * A block looks like:
 *
 *     path/to/file.ts
 *     <<<<<<< SEARCH
 *     old content
 *     =======
 *     new content
 *     >>>>>>> REPLACE
 *
 * The path appears on the line *before* the opening fence, optionally inside a fenced
 * code-block (some models like to wrap the whole edit in ```diff or ```ts). The path may
 * also appear *inside* the SEARCH/REPLACE block as the first line — we accept either,
 * matching aider's permissive behaviour.
 *
 * The fence accepts 5+ `<`, `=`, and `>` characters because some models drift to 7 or 8.
 */

// Match the opening, divider, and closing fences with permissive markers.
// We also accept "<<<<<<< SEARCH foo/bar.ts" inline-path variants.
// Use [ \t] (not \s) so the inline-path capture doesn't drift across the newline into the
// SEARCH block contents.
const OPEN = /^(?<lt>[<]{5,})[ \t]*SEARCH(?:[ \t]+(?<inlinePath>\S.*?))?[ \t]*$/m;
const DIV = /^[=]{5,}[ \t]*$/m;
const CLOSE = /^[>]{5,}[ \t]*REPLACE[ \t]*$/m;

interface RawBlock {
  pathHint: string | null;
  search: string;
  replace: string;
  range: { start: number; end: number };
}

export function parseSearchReplace(input: string): SearchReplaceEdit[] {
  const blocks: RawBlock[] = [];
  let cursor = 0;
  while (cursor < input.length) {
    const rest = input.slice(cursor);
    const openMatch = OPEN.exec(rest);
    if (!openMatch) break;
    const openIdx = cursor + openMatch.index;
    const openLineEnd = openIdx + openMatch[0].length;

    const after = input.slice(openLineEnd);
    const divMatch = DIV.exec(after);
    if (!divMatch) {
      cursor = openLineEnd;
      continue;
    }
    const divIdx = openLineEnd + divMatch.index;
    const divLineEnd = divIdx + divMatch[0].length;

    const afterDiv = input.slice(divLineEnd);
    const closeMatch = CLOSE.exec(afterDiv);
    if (!closeMatch) {
      cursor = divLineEnd;
      continue;
    }
    const closeIdx = divLineEnd + closeMatch.index;
    const closeLineEnd = closeIdx + closeMatch[0].length;

    // SEARCH content sits between the open fence and the divider.
    const searchRaw = input.slice(openLineEnd, divIdx);
    const replaceRaw = input.slice(divLineEnd, closeIdx);

    blocks.push({
      pathHint: openMatch.groups?.inlinePath?.trim() || null,
      search: trimLeadingNewline(searchRaw),
      replace: trimLeadingNewline(replaceRaw),
      range: { start: openIdx, end: closeLineEnd },
    });

    cursor = closeLineEnd;
  }

  return blocks.map((b) => {
    const path = b.pathHint ?? findPathBefore(input, b.range.start) ?? findPathInside(b.search);
    if (!path) {
      throw new Error(
        `SEARCH/REPLACE block at offset ${b.range.start} has no associated path. ` +
          "Place the file path on the line directly before <<<<<<< SEARCH, " +
          "or include it as the first line of the SEARCH block.",
      );
    }
    // If the path was found *inside* the search content (aider-compatible), strip it from
    // the search/replace bodies so we don't try to match it against the file.
    const { search, replace } = stripInlinePath(b.search, b.replace, path);
    return {
      format: "search-replace",
      path,
      search,
      replace,
      range: b.range,
    };
  });
}

function trimLeadingNewline(s: string): string {
  return s.startsWith("\r\n") ? s.slice(2) : s.startsWith("\n") ? s.slice(1) : s;
}

/** Look upward from `pos` for a file path on its own line, skipping fence/blank lines. */
function findPathBefore(input: string, pos: number): string | null {
  // Walk back at most 5 non-blank, non-fence lines.
  let i = input.lastIndexOf("\n", pos - 1);
  let lookback = 5;
  while (i >= 0 && lookback-- > 0) {
    const lineStart = input.lastIndexOf("\n", i - 1) + 1;
    const line = input.slice(lineStart, i).trim();
    i = lineStart - 1;
    if (line === "") continue;
    if (/^```/.test(line)) continue; // fenced opener
    if (looksLikePath(line)) return line;
    return null; // first non-skip line wasn't a path → bail out
  }
  return null;
}

/** Some models put the path as the first line *inside* the SEARCH block. */
function findPathInside(search: string): string | null {
  const firstLine = search.split(/\r?\n/, 1)[0]?.trim();
  if (!firstLine) return null;
  return looksLikePath(firstLine) ? firstLine : null;
}

function stripInlinePath(
  search: string,
  replace: string,
  path: string,
): { search: string; replace: string } {
  const firstSearch = search.split(/\r?\n/, 1)[0]?.trim();
  if (firstSearch === path) {
    const idx = search.indexOf("\n");
    return {
      search: idx === -1 ? "" : search.slice(idx + 1),
      replace,
    };
  }
  return { search, replace };
}

function looksLikePath(s: string): boolean {
  if (s.length === 0 || s.length > 250) return false;
  if (s.includes("`")) return false;
  if (s.startsWith("//") || s.startsWith("#")) return false;
  if (/^[<=>]{3,}/.test(s)) return false; // a fence
  // Heuristic: must contain a slash or a dot, and only one "word group" without spaces.
  if (/\s/.test(s)) return false;
  return /\.[a-zA-Z0-9]+$/.test(s) || /\//.test(s);
}

export function applySearchReplace(
  edit: SearchReplaceEdit,
  original: string | null,
  options: ApplyOptions,
): ApplyResult {
  const allowCreate = options.allowCreate !== false;

  // Empty SEARCH means "create new file with REPLACE contents". Aider parity.
  if (edit.search.trim() === "") {
    if (original !== null && original !== "") {
      return failure(
        edit,
        "ambiguous-match",
        "SEARCH block was empty (which means 'create file') but the target file already exists with content. " +
          "Either delete the file first or provide a non-empty SEARCH block.",
      );
    }
    if (!allowCreate && original === null) {
      return failure(
        edit,
        "missing-original",
        `File ${edit.path} does not exist and allowCreate is false.`,
      );
    }
    return {
      ok: true,
      path: edit.path,
      before: "",
      after: edit.replace,
      edit,
    };
  }

  if (original === null) {
    return failure(
      edit,
      "missing-original",
      `File ${edit.path} not found in the provided FileReader. ` +
        "Pass it in or use an empty SEARCH block to create the file.",
    );
  }

  const result = fuzzyReplace(original, edit.search, edit.replace, {
    fuzzyWhitespace: options.fuzzyWhitespace !== false,
  });

  if (result.kind === "not-found") {
    return failure(
      edit,
      "search-not-found",
      `Could not locate the SEARCH block in ${edit.path}. ` +
        "The model may be quoting stale code, or whitespace differs. " +
        "Inspect the file and re-prompt with the exact current content.",
    );
  }
  if (result.kind === "ambiguous") {
    return failure(
      edit,
      "ambiguous-match",
      `SEARCH block matched ${result.count} locations in ${edit.path}. ` +
        "Make the SEARCH block more specific by including additional surrounding context.",
    );
  }

  return {
    ok: true,
    path: edit.path,
    before: original,
    after: result.text,
    edit,
  };
}

function failure(
  edit: SearchReplaceEdit,
  reason: ApplyFailureReason,
  message: string,
): ApplyResult {
  return { ok: false, path: edit.path, reason, message, edit };
}
