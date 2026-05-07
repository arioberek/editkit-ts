import type { ApplyOptions, ApplyResult, WholeFileEdit } from "../types.ts";

/**
 * Parser & applier for the whole-file format.
 *
 * The model emits a path on its own line, then a fenced code block whose contents replace
 * the file entirely:
 *
 *     src/components/Button.tsx
 *     ```tsx
 *     export function Button() { return <button>Click</button>; }
 *     ```
 *
 * The fence language is ignored. We accept tilde fences (`~~~`) too. We require the path
 * line to come immediately before the opening fence (with optional blank lines between),
 * which keeps the parser from grabbing every fenced block in a long chat response.
 */

const PATH_THEN_FENCE = /^(?<path>[^\s`]+\.[a-zA-Z0-9]+)\s*\n+(?<fence>```|~~~)[^\n]*\n/m;

export function parseWholeFile(input: string): WholeFileEdit[] {
  const edits: WholeFileEdit[] = [];
  let cursor = 0;
  while (cursor < input.length) {
    const rest = input.slice(cursor);
    const open = PATH_THEN_FENCE.exec(rest);
    if (!open) break;
    const matchStart = cursor + open.index;
    const fenceChar = open.groups?.fence ?? "```";
    const path = open.groups?.path?.trim();
    if (!path) {
      cursor = matchStart + open[0].length;
      continue;
    }

    const contentStart = matchStart + open[0].length;
    const closeIdx = findClosingFence(input, contentStart, fenceChar);
    if (closeIdx === -1) break;

    let contents = input.slice(contentStart, closeIdx);
    // Trim a single trailing newline so the closing fence is on its own line cleanly.
    if (contents.endsWith("\n")) contents = contents.slice(0, -1);

    edits.push({
      format: "whole-file",
      path,
      contents,
      range: { start: matchStart, end: closeIdx + fenceChar.length },
    });

    cursor = closeIdx + fenceChar.length;
  }
  return edits;
}

function findClosingFence(input: string, from: number, fenceChar: string): number {
  // Closing fence is the fence string at the start of a line, possibly followed by whitespace.
  const re = new RegExp(`^${fenceChar}\\s*$`, "m");
  re.lastIndex = from;
  const slice = input.slice(from);
  const m = re.exec(slice);
  return m ? from + m.index : -1;
}

export function applyWholeFile(
  edit: WholeFileEdit,
  original: string | null,
  options: ApplyOptions,
): ApplyResult {
  const allowCreate = options.allowCreate !== false;
  if (original === null && !allowCreate) {
    return {
      ok: false,
      path: edit.path,
      reason: "missing-original",
      message: `File ${edit.path} does not exist and allowCreate is false.`,
      edit,
    };
  }
  return {
    ok: true,
    path: edit.path,
    before: original ?? "",
    after: edit.contents.endsWith("\n") ? edit.contents : `${edit.contents}\n`,
    edit,
  };
}
