/**
 * Whitespace-tolerant text replacement.
 *
 * Three escalating strategies, applied in order:
 *
 * 1. **Exact match** — the search text appears byte-for-byte in the original.
 *    If it appears more than once, we return `ambiguous`.
 * 2. **Whitespace-tolerant match** — re-indent the search text to match the
 *    leading whitespace of the candidate location in the original. Useful
 *    when models drop the indentation of nested blocks.
 * 3. **Trim-EOL match** — collapse trailing whitespace on each line and try again.
 *    Catches models that reflow line endings.
 *
 * The replacement preserves the indentation hint discovered during matching, so
 * the result reads naturally even when the model emitted unindented code.
 *
 * Ported from aider's `search_replace.py` strategies (replace_part_with_missing_leading_whitespace,
 * replace_most_similar_chunk). Behaviour-tested against aider's fixtures wherever possible.
 */
export interface FuzzyReplaceOptions {
  fuzzyWhitespace?: boolean;
}

export type FuzzyReplaceResult =
  | { kind: "ok"; text: string; strategy: FuzzyStrategy }
  | { kind: "ambiguous"; count: number }
  | { kind: "not-found" };

type FuzzyStrategy = "exact" | "indent-shift" | "trim-eol";

export function fuzzyReplace(
  original: string,
  search: string,
  replace: string,
  options: FuzzyReplaceOptions = {},
): FuzzyReplaceResult {
  const fuzzy = options.fuzzyWhitespace !== false;

  // 1. Exact match.
  const exact = countOccurrences(original, search);
  if (exact === 1) {
    return { kind: "ok", text: original.replace(search, replace), strategy: "exact" };
  }
  if (exact > 1) return { kind: "ambiguous", count: exact };

  if (!fuzzy) return { kind: "not-found" };

  // 2. Indent-shift match.
  const shifted = tryIndentShift(original, search, replace);
  if (shifted.kind === "ok" || shifted.kind === "ambiguous") return shifted;

  // 3. Trim-EOL match.
  const trimmed = tryTrimEol(original, search, replace);
  if (trimmed.kind === "ok" || trimmed.kind === "ambiguous") return trimmed;

  return { kind: "not-found" };
}

function countOccurrences(haystack: string, needle: string): number {
  if (needle === "") return 0;
  let count = 0;
  let idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) {
    count++;
    idx += needle.length;
  }
  return count;
}

/**
 * Strategy 2: re-indent the SEARCH text to match the indent of the candidate slice.
 *
 * We find the minimum leading-whitespace prefix of all non-blank lines in `search`,
 * strip it, then sliding-window over `original` line-aligned looking for a section
 * whose lines (after trimming the same minimum) match line-by-line. The leading
 * whitespace of the matched region in the original is then prepended to every
 * non-blank line of `replace` to produce the patched output.
 */
function tryIndentShift(
  original: string,
  search: string,
  replace: string,
): FuzzyReplaceResult {
  const searchLines = search.split("\n");
  const replaceLines = replace.split("\n");

  // Strip a common leading-whitespace prefix from search.
  const minSearchIndent = minIndent(searchLines);
  const dedentedSearch = searchLines.map((l) => stripPrefix(l, minSearchIndent));

  const originalLines = original.split("\n");
  const matches: number[] = [];

  outer: for (let i = 0; i + dedentedSearch.length <= originalLines.length; i++) {
    // Determine the leading whitespace at this candidate position from its first non-blank line.
    let leading: string | null = null;
    for (let j = 0; j < dedentedSearch.length; j++) {
      const dl = dedentedSearch[j] ?? "";
      const ol = originalLines[i + j] ?? "";
      if (dl.trim() === "") {
        // Blank line: original must also be effectively blank.
        if (ol.trim() !== "") continue outer;
        continue;
      }
      const expectedTail = dl;
      if (leading === null) {
        // Use this line to discover the indent.
        if (!ol.endsWith(expectedTail)) continue outer;
        leading = ol.slice(0, ol.length - expectedTail.length);
        if (!/^\s*$/.test(leading)) continue outer;
      } else {
        if (ol !== leading + expectedTail) continue outer;
      }
    }
    matches.push(i);
  }

  if (matches.length === 0) return { kind: "not-found" };
  if (matches.length > 1) return { kind: "ambiguous", count: matches.length };

  const startLine = matches[0] ?? 0;
  // Compute leading from the first non-blank line of the matched region.
  let leading = "";
  for (let j = 0; j < dedentedSearch.length; j++) {
    if ((dedentedSearch[j] ?? "").trim() !== "") {
      const ol = originalLines[startLine + j] ?? "";
      const tail = dedentedSearch[j] ?? "";
      leading = ol.slice(0, ol.length - tail.length);
      break;
    }
  }

  const minReplaceIndent = minIndent(replaceLines);
  const reindentedReplace = replaceLines
    .map((l) => (l.trim() === "" ? l : leading + stripPrefix(l, minReplaceIndent)))
    .join("\n");

  const before = originalLines.slice(0, startLine).join("\n");
  const after = originalLines.slice(startLine + dedentedSearch.length).join("\n");
  const text =
    (before === "" ? "" : `${before}\n`) +
    reindentedReplace +
    (after === "" ? "" : `\n${after}`);
  return { kind: "ok", text, strategy: "indent-shift" };
}

/** Strategy 3: trim trailing whitespace on every line, then exact-match. */
function tryTrimEol(
  original: string,
  search: string,
  replace: string,
): FuzzyReplaceResult {
  const trimRight = (s: string) => s.replace(/[ \t]+$/gm, "");
  const trimmedOrig = trimRight(original);
  const trimmedSearch = trimRight(search);
  const occ = countOccurrences(trimmedOrig, trimmedSearch);
  if (occ === 0) return { kind: "not-found" };
  if (occ > 1) return { kind: "ambiguous", count: occ };

  const idx = trimmedOrig.indexOf(trimmedSearch);
  // Map back to a slice in the *original*. We do this by walking original line-by-line
  // until we've consumed `idx` characters of trimmed-equivalent text.
  const startOrig = mapTrimmedIndexToOriginal(original, idx);
  const endOrig = mapTrimmedIndexToOriginal(original, idx + trimmedSearch.length);
  const text = original.slice(0, startOrig) + replace + original.slice(endOrig);
  return { kind: "ok", text, strategy: "trim-eol" };
}

function mapTrimmedIndexToOriginal(original: string, trimmedIdx: number): number {
  let trimmedSeen = 0;
  let i = 0;
  while (i < original.length && trimmedSeen < trimmedIdx) {
    const c = original[i] ?? "";
    if (c === "\n") {
      // Trailing whitespace before this newline was stripped — skip back over it in the
      // trimmed accounting (we don't add it to trimmedSeen).
      trimmedSeen += 1; // the newline itself counts in the trimmed string
      i++;
      continue;
    }
    // Look ahead for a run of trailing whitespace ending at a newline.
    if ((c === " " || c === "\t") && lineEndsWithThisRun(original, i)) {
      // Skip this run without incrementing trimmedSeen.
      while (i < original.length && (original[i] === " " || original[i] === "\t")) i++;
      continue;
    }
    trimmedSeen++;
    i++;
  }
  return i;
}

function lineEndsWithThisRun(s: string, i: number): boolean {
  let j = i;
  while (j < s.length && (s[j] === " " || s[j] === "\t")) j++;
  return j === s.length || s[j] === "\n";
}

function minIndent(lines: string[]): string {
  let prefix: string | null = null;
  for (const line of lines) {
    if (line.trim() === "") continue;
    const m = line.match(/^[ \t]*/);
    const lead = m ? m[0] : "";
    if (prefix === null) {
      prefix = lead;
    } else {
      prefix = commonPrefix(prefix, lead);
    }
    if (prefix === "") break;
  }
  return prefix ?? "";
}

function commonPrefix(a: string, b: string): string {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i++;
  return a.slice(0, i);
}

function stripPrefix(line: string, prefix: string): string {
  return line.startsWith(prefix) ? line.slice(prefix.length) : line;
}
