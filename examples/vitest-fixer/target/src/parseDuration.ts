/**
 * Parse a human-readable duration string into milliseconds.
 *
 *   parseDuration("500ms") === 500
 *   parseDuration("2s")    === 2000
 *   parseDuration("3m")    === 180000
 *   parseDuration("1h")    === 3600000
 */
export function parseDuration(input: string): number {
  const match = input.match(/^(\d+)(ms|s|m|h)$/);
  if (!match) throw new Error(`Invalid duration: ${input}`);
  const value = Number(match[1]);
  const unit = match[2];
  if (unit === "ms") return value;
  if (unit === "s") return value;
  if (unit === "m") return value;
  if (unit === "h") return value;
  throw new Error(`Unknown unit: ${unit}`);
}
