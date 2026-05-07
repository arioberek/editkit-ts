import type {
  ApplyFailureReason,
  ApplyOptions,
  ApplyResult,
  UnifiedDiffEdit,
  UnifiedDiffHunk,
} from "../types.ts";

/**
 * Parser & applier for unified-diff format.
 *
 *     --- a/path/to/file.ts
 *     +++ b/path/to/file.ts
 *     @@ -1,3 +1,3 @@
 *      context line
 *     -removed
 *     +added
 *      context line
 *
 * The applier is offset-tolerant: it uses the hunk header's `oldStart` as a hint, but if the
 * context lines don't match exactly there, it sweeps a window around the hint to find a unique
 * location. This handles the common LLM failure mode where line numbers drift slightly.
 *
 * Multiple files are supported in a single input — each new `--- /+++ ` pair starts a new edit.
 */

const FILE_HEADER = /^---\s+(?:a\/)?(?<old>\S.*?)\s*\n\+\+\+\s+(?:b\/)?(?<new>\S.*?)\s*$/m;
const HUNK_HEADER =
  /^@@\s+-(?<oldStart>\d+)(?:,(?<oldLines>\d+))?\s+\+(?<newStart>\d+)(?:,(?<newLines>\d+))?\s+@@.*$/;

export function parseUnifiedDiff(input: string): UnifiedDiffEdit[] {
  const lines = input.split(/\r?\n/);
  const edits: UnifiedDiffEdit[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (!line.startsWith("--- ")) {
      i++;
      continue;
    }
    const oldMatch = /^---\s+(?:a\/)?(?<old>\S.*?)\s*$/.exec(line);
    const next = lines[i + 1] ?? "";
    const newMatch = /^\+\+\+\s+(?:b\/)?(?<new>\S.*?)\s*$/.exec(next);
    if (!oldMatch || !newMatch) {
      i++;
      continue;
    }

    const oldPath = oldMatch.groups?.old?.trim();
    const newPath = newMatch.groups?.new?.trim();
    if (!oldPath || !newPath) {
      i += 2;
      continue;
    }
    const startOffset = offsetOf(input, lines, i);

    i += 2;
    const hunks: UnifiedDiffHunk[] = [];
    while (i < lines.length) {
      const hl = lines[i] ?? "";
      if (hl.startsWith("--- ")) break;
      const hh = HUNK_HEADER.exec(hl);
      if (!hh) {
        i++;
        continue;
      }
      const oldStart = Number.parseInt(hh.groups?.oldStart ?? "0", 10);
      const oldLines = Number.parseInt(hh.groups?.oldLines ?? "1", 10);
      const newStart = Number.parseInt(hh.groups?.newStart ?? "0", 10);
      const newLines = Number.parseInt(hh.groups?.newLines ?? "1", 10);
      i++;
      const body: string[] = [];
      while (i < lines.length) {
        const bl = lines[i] ?? "";
        if (bl.startsWith("@@") || bl.startsWith("--- ")) break;
        // Hunk lines must start with ' ', '+', '-', or '\' (no-newline marker).
        // Empty lines are tolerated only if they're surrounded by hunk lines (some tools
        // emit a bare empty line for an empty context line). We do this by peeking ahead.
        if (
          bl.startsWith(" ") ||
          bl.startsWith("+") ||
          bl.startsWith("-") ||
          bl.startsWith("\\")
        ) {
          body.push(bl);
          i++;
          continue;
        }
        if (bl.length === 0) {
          // Look ahead — if the next line continues the hunk, treat this as an empty
          // context line. Otherwise we're at the end of the hunk (a trailing newline).
          const peek = lines[i + 1] ?? "";
          if (
            peek.startsWith(" ") ||
            peek.startsWith("+") ||
            peek.startsWith("-")
          ) {
            body.push(bl);
            i++;
            continue;
          }
          // End of hunk; do not consume the blank line so a following @@ or --- can be seen.
          break;
        }
        break;
      }
      hunks.push({ oldStart, oldLines, newStart, newLines, lines: body });
    }
    const endOffset = offsetOf(input, lines, i);

    edits.push({
      format: "unified-diff",
      path: newPath === "/dev/null" ? oldPath : newPath,
      oldPath: oldPath !== newPath ? oldPath : undefined,
      hunks,
      range: { start: startOffset, end: endOffset },
    });
  }

  return edits;
}

function offsetOf(input: string, lines: string[], lineIndex: number): number {
  // Sum lengths of preceding lines plus newline characters. We don't track which line
  // ending each line had, so we use input directly.
  let off = 0;
  for (let k = 0; k < lineIndex && k < lines.length; k++) {
    off += (lines[k] ?? "").length;
    // step over the newline (assume \n; if input had \r\n, length already excluded \r — adjust)
    if (input[off] === "\r") off++;
    if (input[off] === "\n") off++;
  }
  return off;
}

export function applyUnifiedDiff(
  edit: UnifiedDiffEdit,
  original: string | null,
  options: ApplyOptions,
): ApplyResult {
  const allowCreate = options.allowCreate !== false;

  // /dev/null oldPath means "create"; oldPath === newPath but no original → error unless allowCreate.
  if (original === null) {
    if (!allowCreate) {
      return failure(
        edit,
        "missing-original",
        `File ${edit.path} does not exist and allowCreate is false.`,
      );
    }
    // Build file from the hunks: take only added/context lines.
    const out: string[] = [];
    for (const hunk of edit.hunks) {
      for (const l of hunk.lines) {
        if (l.startsWith("+") || l.startsWith(" ")) {
          out.push(l.slice(1));
        }
      }
    }
    return {
      ok: true,
      path: edit.path,
      before: "",
      after: `${out.join("\n")}\n`,
      edit,
    };
  }

  const lineEnding = detectLineEnding(original);
  let lines = original.split(/\r?\n/);
  // Track whether the original had a trailing newline.
  const hadTrailingNewline = original.endsWith("\n");
  if (hadTrailingNewline && lines[lines.length - 1] === "") lines.pop();

  // Apply hunks in order. We run a "look ahead" search for the hunk's context if oldStart is off.
  for (const hunk of edit.hunks) {
    const result = applyHunk(lines, hunk);
    if (result.kind === "fail") {
      return failure(edit, "hunk-context-mismatch", result.reason);
    }
    lines = result.lines;
  }

  let after = lines.join(lineEnding);
  if (hadTrailingNewline) after += lineEnding;
  return { ok: true, path: edit.path, before: original, after, edit };
}

function applyHunk(
  lines: string[],
  hunk: UnifiedDiffHunk,
): { kind: "ok"; lines: string[] } | { kind: "fail"; reason: string } {
  // Build the expected old block (context + removed) and the new block (context + added).
  const oldBlock: string[] = [];
  const newBlock: string[] = [];
  for (const l of hunk.lines) {
    if (l.startsWith("\\")) continue; // "\ No newline at end of file"
    const tag = l[0];
    const body = l.slice(1);
    if (tag === " ") {
      oldBlock.push(body);
      newBlock.push(body);
    } else if (tag === "-") {
      oldBlock.push(body);
    } else if (tag === "+") {
      newBlock.push(body);
    }
  }

  // Hunk says it starts at oldStart (1-based). Try that line first.
  const hint = Math.max(0, hunk.oldStart - 1);
  const candidate = findBlock(lines, oldBlock, hint);
  if (candidate === -1) {
    return {
      kind: "fail",
      reason:
        `Hunk @@-${hunk.oldStart}@@ context not found. ` +
        "The model's diff may be against a different version of the file.",
    };
  }
  const before = lines.slice(0, candidate);
  const after = lines.slice(candidate + oldBlock.length);
  return { kind: "ok", lines: [...before, ...newBlock, ...after] };
}

/**
 * Find `block` in `lines` starting near `hint`. Returns the line index, or -1 if not found
 * (or found ambiguously when far from the hint).
 */
function findBlock(lines: string[], block: string[], hint: number): number {
  if (block.length === 0) return hint;
  const max = lines.length - block.length;
  if (max < 0) return -1;

  const equal = (start: number) => {
    for (let i = 0; i < block.length; i++) {
      if (lines[start + i] !== block[i]) return false;
    }
    return true;
  };

  // Try hint exactly.
  if (hint >= 0 && hint <= max && equal(hint)) return hint;

  // Spiral outward from hint.
  for (let dist = 1; dist <= Math.max(hint, max - hint); dist++) {
    const above = hint - dist;
    const below = hint + dist;
    if (above >= 0 && above <= max && equal(above)) return above;
    if (below >= 0 && below <= max && equal(below)) return below;
  }
  return -1;
}

function detectLineEnding(s: string): string {
  return s.includes("\r\n") ? "\r\n" : "\n";
}

function failure(
  edit: UnifiedDiffEdit,
  reason: ApplyFailureReason,
  message: string,
): ApplyResult {
  return { ok: false, path: edit.path, reason, message, edit };
}
